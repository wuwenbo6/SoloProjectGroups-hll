package cache

import (
	"net"
	"testing"
	"time"

	"github.com/miekg/dns"
)

func makeTestMsg(name string, qtype uint16) *dns.Msg {
	msg := new(dns.Msg)
	msg.SetQuestion(dns.Fqdn(name), qtype)
	msg.Answer = append(msg.Answer, &dns.A{
		Hdr: dns.RR_Header{Name: dns.Fqdn(name), Rrtype: qtype, Class: dns.ClassINET, Ttl: 300},
		A:   net.ParseIP("1.2.3.4"),
	})
	return msg
}

func TestLRUCache_Basic(t *testing.T) {
	c := NewDNSCache(3)

	key1 := "test1|A|IN"
	key2 := "test2|A|IN"
	key3 := "test3|A|IN"
	key4 := "test4|A|IN"

	msg1 := makeTestMsg("test1.com.", dns.TypeA)
	msg2 := makeTestMsg("test2.com.", dns.TypeA)
	msg3 := makeTestMsg("test3.com.", dns.TypeA)
	msg4 := makeTestMsg("test4.com.", dns.TypeA)

	c.Set(key1, msg1, time.Minute)
	c.Set(key2, msg2, time.Minute)
	c.Set(key3, msg3, time.Minute)

	if c.GetEntryCount() != 3 {
		t.Fatalf("expected 3 entries, got %d", c.GetEntryCount())
	}

	c.Get(key1)
	c.Get(key1)
	c.Get(key2)

	c.Set(key4, msg4, time.Minute)

	if c.GetEntryCount() != 3 {
		t.Fatalf("expected 3 entries after eviction, got %d", c.GetEntryCount())
	}

	if _, ok := c.Get(key3); ok {
		t.Fatal("key3 should have been evicted (LRU)")
	}

	if _, ok := c.Get(key1); !ok {
		t.Fatal("key1 should still exist")
	}

	stats := c.GetStats()
	if stats.Hits != 3 {
		t.Fatalf("expected 3 hits, got %d", stats.Hits)
	}
	if stats.Misses != 1 {
		t.Fatalf("expected 1 miss, got %d", stats.Misses)
	}
	if stats.Evictions != 1 {
		t.Fatalf("expected 1 eviction, got %d", stats.Evictions)
	}
}

func TestLRUCache_TTL(t *testing.T) {
	c := NewDNSCache(10)
	key := "ttl|A|IN"
	msg := makeTestMsg("ttl.com.", dns.TypeA)

	c.Set(key, msg, 100*time.Millisecond)

	if _, ok := c.Get(key); !ok {
		t.Fatal("should hit before TTL expires")
	}

	time.Sleep(150 * time.Millisecond)

	if _, ok := c.Get(key); ok {
		t.Fatal("should miss after TTL expires")
	}

	stats := c.GetStats()
	if stats.ExpiredHits != 1 {
		t.Fatalf("expected 1 expired hit, got %d", stats.ExpiredHits)
	}
	if c.GetEntryCount() != 0 {
		t.Fatalf("expired entry should be removed, got %d", c.GetEntryCount())
	}
}

func TestHitRateCalculation(t *testing.T) {
	c := NewDNSCache(100)

	if c.HitRate() != 0 {
		t.Fatalf("initial hit rate should be 0, got %.2f", c.HitRate())
	}

	msg := makeTestMsg("rate.com.", dns.TypeA)
	c.Set("rate|A|IN", msg, time.Minute)

	expiredMsg := makeTestMsg("expired.com.", dns.TypeA)
	c.Set("expired|A|IN", expiredMsg, 50*time.Millisecond)
	time.Sleep(100 * time.Millisecond)

	for i := 0; i < 70; i++ {
		c.Get("rate|A|IN")
	}
	for i := 0; i < 20; i++ {
		c.Get("expired|A|IN")
	}
	for i := 0; i < 10; i++ {
		c.Get("missing|A|IN")
	}

	rate := c.HitRate()
	if rate < 69 || rate > 71 {
		t.Fatalf("expected hit rate ~70%%, got %.2f", rate)
	}

	effectiveRate := c.EffectiveHitRate()
	if effectiveRate < 89 || effectiveRate > 91 {
		t.Fatalf("expected effective hit rate ~90%% (includes expired), got %.2f", effectiveRate)
	}
}

func TestGenerateCacheKey(t *testing.T) {
	msg1 := new(dns.Msg)
	msg1.SetQuestion("example.com.", dns.TypeA)

	msg2 := new(dns.Msg)
	msg2.SetQuestion("EXAMPLE.COM.", dns.TypeA)

	key1 := GenerateCacheKey(msg1)
	key2 := GenerateCacheKey(msg2)

	if key1 != key2 {
		t.Fatalf("case insensitive keys should match: %s vs %s", key1, key2)
	}

	msgEDNS := new(dns.Msg)
	msgEDNS.SetQuestion("example.com.", dns.TypeA)
	msgEDNS.SetEdns0(4096, true)

	keyEDNS := GenerateCacheKey(msgEDNS)
	if keyEDNS == key1 {
		t.Fatal("EDNS and non-EDNS keys should differ")
	}
}

func TestGetMinTTL(t *testing.T) {
	msg := new(dns.Msg)
	msg.SetQuestion("example.com.", dns.TypeA)
	msg.Answer = append(msg.Answer, &dns.A{
		Hdr: dns.RR_Header{Name: "example.com.", Rrtype: dns.TypeA, Class: dns.ClassINET, Ttl: 300},
	})
	msg.Ns = append(msg.Ns, &dns.NS{
		Hdr: dns.RR_Header{Name: "example.com.", Rrtype: dns.TypeNS, Class: dns.ClassINET, Ttl: 600},
	})

	ttl := GetMinTTL(msg)
	if ttl != 300*time.Second {
		t.Fatalf("expected min TTL 300s, got %v", ttl)
	}

	msg2 := new(dns.Msg)
	msg2.SetQuestion("example.com.", dns.TypeA)
	ttl2 := GetMinTTL(msg2)
	if ttl2 != 30*time.Second {
		t.Fatalf("expected default TTL 30s for empty answer, got %v", ttl2)
	}
}

func TestCleanExpired(t *testing.T) {
	c := NewDNSCache(10)

	msg := makeTestMsg("clean.com.", dns.TypeA)
	c.Set("clean1|A|IN", msg, 50*time.Millisecond)
	c.Set("clean2|A|IN", msg, 200*time.Millisecond)
	c.Set("clean3|A|IN", msg, time.Minute)

	time.Sleep(100 * time.Millisecond)

	evicted := c.CleanExpired()
	if evicted != 1 {
		t.Fatalf("expected 1 expired entry evicted, got %d", evicted)
	}

	if c.GetEntryCount() != 2 {
		t.Fatalf("expected 2 entries remaining, got %d", c.GetEntryCount())
	}
}

func TestCacheUpdateExisting(t *testing.T) {
	c := NewDNSCache(10)

	msg1 := makeTestMsg("update.com.", dns.TypeA)
	msg1.Answer[0].(*dns.A).A = net.ParseIP("1.1.1.1")

	msg2 := makeTestMsg("update.com.", dns.TypeA)
	msg2.Answer[0].(*dns.A).A = net.ParseIP("2.2.2.2")

	c.Set("update|A|IN", msg1, time.Minute)
	time.Sleep(10 * time.Millisecond)
	c.Set("update|A|IN", msg2, time.Minute)

	if c.GetEntryCount() != 1 {
		t.Fatalf("expected 1 entry after update, got %d", c.GetEntryCount())
	}

	got, ok := c.Get("update|A|IN")
	if !ok {
		t.Fatal("should hit")
	}
	if got.Answer[0].(*dns.A).A.String() != "2.2.2.2" {
		t.Fatalf("expected updated IP 2.2.2.2, got %s", got.Answer[0].(*dns.A).A)
	}

	stats := c.GetStats()
	if stats.Evictions != 0 {
		t.Fatalf("update should not cause eviction, got %d", stats.Evictions)
	}
}
