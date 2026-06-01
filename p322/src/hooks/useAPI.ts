import { useEffect, useState, useCallback } from "react";
import type { Subnet, MDnsService, ReflectorStatus, ServiceRecords, AuthPolicy } from "@/utils/types";

const API_BASE = "/api";

export function useSubnets() {
  const [subnets, setSubnets] = useState<Subnet[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSubnets = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/subnets`);
      const data = await res.json();
      setSubnets(data);
    } catch (e) {
      console.error("Failed to fetch subnets", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubnets();
    const interval = setInterval(fetchSubnets, 15000);
    return () => clearInterval(interval);
  }, [fetchSubnets]);

  return { subnets, loading, refetch: fetchSubnets };
}

export function useServices(subnetId?: string, type?: string, status?: string) {
  const [services, setServices] = useState<MDnsService[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchServices = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (type) params.set("type", type);
      if (status) params.set("status", status);
      const base = subnetId ? `${API_BASE}/subnets/${subnetId}/services` : `${API_BASE}/services`;
      const res = await fetch(`${base}?${params.toString()}`);
      const data = await res.json();
      setServices(data);
    } catch (e) {
      console.error("Failed to fetch services", e);
    } finally {
      setLoading(false);
    }
  }, [subnetId, type, status]);

  useEffect(() => {
    fetchServices();
    const interval = setInterval(fetchServices, 10000);
    return () => clearInterval(interval);
  }, [fetchServices]);

  return { services, loading, refetch: fetchServices };
}

export function useReflectorStatus() {
  const [status, setStatus] = useState<ReflectorStatus | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/reflector/status`);
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      console.error("Failed to fetch reflector status", e);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return { status, refetch: fetchStatus };
}

export function useServiceRecords(serviceId: string | null) {
  const [records, setRecords] = useState<ServiceRecords | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!serviceId) {
      setRecords(null);
      return;
    }
    setLoading(true);
    fetch(`${API_BASE}/services/${serviceId}/records`)
      .then((res) => res.json())
      .then((data) => setRecords(data))
      .catch((e) => console.error("Failed to fetch records", e))
      .finally(() => setLoading(false));
  }, [serviceId]);

  return { records, loading };
}

export function useServiceStats() {
  const [stats, setStats] = useState<Record<string, number>>({});

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/stats/services`);
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error("Failed to fetch stats", e);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return { stats, refetch: fetchStats };
}

export function useAuthPolicy() {
  const [policy, setPolicy] = useState<AuthPolicy | null>(null);

  const fetchPolicy = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/policy`);
      const data = await res.json();
      setPolicy(data);
    } catch (e) {
      console.error("Failed to fetch auth policy", e);
    }
  }, []);

  const updatePolicy = useCallback(async (newPolicy: AuthPolicy) => {
    try {
      const res = await fetch(`${API_BASE}/auth/policy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPolicy),
      });
      const data = await res.json();
      setPolicy(data);
      return data;
    } catch (e) {
      console.error("Failed to update auth policy", e);
      throw e;
    }
  }, []);

  useEffect(() => {
    fetchPolicy();
  }, [fetchPolicy]);

  return { policy, refetch: fetchPolicy, updatePolicy };
}

export async function setServiceAuthorized(serviceId: string, authorized: boolean) {
  const res = await fetch(`${API_BASE}/services/${serviceId}/auth`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authorized }),
  });
  return res.json();
}

export async function exportServices(subnetId?: string, type?: string, status?: string) {
  const params = new URLSearchParams();
  if (subnetId) params.set("subnetId", subnetId);
  if (type) params.set("type", type);
  if (status) params.set("status", status);
  const res = await fetch(`${API_BASE}/services/export?${params.toString()}`);
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mdns-services.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
