package geo

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/oschwald/geoip2-golang"

	"sip-detector/types"
)

type GeoLookup struct {
	cityDB     *geoip2.Reader
	asnDB      *geoip2.Reader
	useOnline  bool
	httpClient *http.Client
}

func NewGeoLookup(cityDBPath, asnDBPath string) (*GeoLookup, error) {
	gl := &GeoLookup{
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}

	if cityDBPath != "" {
		db, err := geoip2.Open(cityDBPath)
		if err != nil {
			return nil, fmt.Errorf("failed to open city DB: %w", err)
		}
		gl.cityDB = db
	}

	if asnDBPath != "" {
		db, err := geoip2.Open(asnDBPath)
		if err != nil {
			gl.Close()
			return nil, fmt.Errorf("failed to open ASN DB: %w", err)
		}
		gl.asnDB = db
	}

	if gl.cityDB == nil {
		gl.useOnline = true
	}

	return gl, nil
}

func (gl *GeoLookup) Close() {
	if gl.cityDB != nil {
		gl.cityDB.Close()
	}
	if gl.asnDB != nil {
		gl.asnDB.Close()
	}
}

func (gl *GeoLookup) Lookup(ipStr string) (*types.GeoInfo, error) {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return nil, fmt.Errorf("invalid IP address: %s", ipStr)
	}

	if gl.cityDB != nil {
		return gl.lookupOffline(ip)
	}

	return gl.lookupOnline(ipStr)
}

func (gl *GeoLookup) lookupOffline(ip net.IP) (*types.GeoInfo, error) {
	info := &types.GeoInfo{}

	if gl.cityDB != nil {
		city, err := gl.cityDB.City(ip)
		if err != nil {
			return nil, fmt.Errorf("city lookup failed: %w", err)
		}

		if country, ok := city.Country.Names["zh-CN"]; ok {
			info.Country = country
		} else if country, ok := city.Country.Names["en"]; ok {
			info.Country = country
		}
		info.CountryCode = city.Country.IsoCode

		if cityName, ok := city.City.Names["zh-CN"]; ok {
			info.City = cityName
		} else if cityName, ok := city.City.Names["en"]; ok {
			info.City = cityName
		}

		info.Latitude = city.Location.Latitude
		info.Longitude = city.Location.Longitude
		info.Timezone = city.Location.TimeZone
	}

	if gl.asnDB != nil {
		asn, err := gl.asnDB.ASN(ip)
		if err == nil {
			info.ASN = asn.AutonomousSystemNumber
			info.ISP = asn.AutonomousSystemOrganization
		}
	}

	return info, nil
}

type ipAPIResponse struct {
	Status      string  `json:"status"`
	Country     string  `json:"country"`
	CountryCode string  `json:"countryCode"`
	City        string  `json:"city"`
	Lat         float64 `json:"lat"`
	Lon         float64 `json:"lon"`
	Timezone    string  `json:"timezone"`
	ISP         string  `json:"isp"`
	AS          string  `json:"as"`
}

func (gl *GeoLookup) lookupOnline(ipStr string) (*types.GeoInfo, error) {
	url := fmt.Sprintf("http://ip-api.com/json/%s?fields=status,country,countryCode,city,lat,lon,timezone,isp,as", ipStr)

	resp, err := gl.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("online lookup failed: %w", err)
	}
	defer resp.Body.Close()

	var result ipAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if result.Status != "success" {
		return nil, fmt.Errorf("lookup returned non-success status")
	}

	info := &types.GeoInfo{
		Country:     result.Country,
		CountryCode: result.CountryCode,
		City:        result.City,
		Latitude:    result.Lat,
		Longitude:   result.Lon,
		Timezone:    result.Timezone,
		ISP:         result.ISP,
	}

	return info, nil
}
