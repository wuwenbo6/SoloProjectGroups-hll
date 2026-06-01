package s1ap

import (
	"sync"
)

type AtomicIDGenerator struct {
	counter int64
	mu      sync.Mutex
}

var (
	enbUeIDGenerator *AtomicIDGenerator
	mmeUeIDGenerator *AtomicIDGenerator
	once             sync.Once
)

func GetENBUeIDGenerator() *AtomicIDGenerator {
	once.Do(func() {
		enbUeIDGenerator = newAtomicIDGenerator(1)
		mmeUeIDGenerator = newAtomicIDGenerator(1)
	})
	return enbUeIDGenerator
}

func GetMMEUeIDGenerator() *AtomicIDGenerator {
	once.Do(func() {
		enbUeIDGenerator = newAtomicIDGenerator(1)
		mmeUeIDGenerator = newAtomicIDGenerator(1)
	})
	return mmeUeIDGenerator
}

func newAtomicIDGenerator(start int64) *AtomicIDGenerator {
	return &AtomicIDGenerator{
		counter: start,
	}
}

func (g *AtomicIDGenerator) Next() int {
	g.mu.Lock()
	defer g.mu.Unlock()
	id := g.counter
	g.counter++
	return int(id)
}

func (g *AtomicIDGenerator) Current() int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return int(g.counter - 1)
}

func (g *AtomicIDGenerator) Reset() {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.counter = 1
}
