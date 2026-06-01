package docker

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/docker/docker/client"
)

type Client struct {
	docker *client.Client
}

func NewClient() (*Client, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("failed to create docker client: %w", err)
	}
	return &Client{docker: cli}, nil
}

func (c *Client) Close() error {
	return c.docker.Close()
}

func (c *Client) ListNodes(ctx context.Context) ([]swarm.Node, error) {
	return c.docker.NodeList(ctx, types.NodeListOptions{})
}

func (c *Client) GetNode(ctx context.Context, nodeID string) (*swarm.Node, error) {
	node, _, err := c.docker.NodeInspectWithRaw(ctx, nodeID)
	if err != nil {
		return nil, err
	}
	return &node, nil
}

func (c *Client) UpdateNode(ctx context.Context, nodeID string, version swarm.Version, spec swarm.NodeSpec) error {
	return c.docker.NodeUpdate(ctx, nodeID, version, spec)
}

func (c *Client) RemoveNode(ctx context.Context, nodeID string, force bool) error {
	return c.docker.NodeRemove(ctx, nodeID, types.NodeRemoveOptions{Force: force})
}

type ServiceConfig struct {
	Name        string
	Image       string
	Replicas    int
	Env         []string
	Labels      map[string]string
	Ports       []PortConfig
	Constraints []string
	Resources   *ResourceLimits
	GPU         *GPUConfig
}

type PortConfig struct {
	HostPort      int
	ContainerPort int
	Protocol      string
}

type ResourceLimits struct {
	CPUs   float64
	Memory int64
}

type GPUConfig struct {
	Count       int
	GPUMemory   int64
	Driver      string
	DeviceIDs   []string
	Capabilities []string
}

type GPUInfo struct {
	Count       int
	Type        string
	MemoryTotal int64
	MemoryUsed  int64
	Utilization float64
	Driver      string
}

func (c *Client) CreateService(ctx context.Context, config ServiceConfig) (string, error) {
	maxReplicas := uint64(config.Replicas)
	
	env := config.Env
	if config.GPU != nil && config.GPU.Count > 0 {
		env = append(env, "NVIDIA_VISIBLE_DEVICES=all")
		env = append(env, "NVIDIA_DRIVER_CAPABILITIES=compute,utility")
	}

	serviceSpec := swarm.ServiceSpec{
		Annotations: swarm.Annotations{
			Name:   config.Name,
			Labels: config.Labels,
		},
		TaskTemplate: swarm.TaskSpec{
			ContainerSpec: &swarm.ContainerSpec{
				Image: config.Image,
				Env:   env,
			},
			RestartPolicy: &swarm.RestartPolicy{
				Condition: swarm.RestartPolicyConditionAny,
			},
			Runtime: getRuntime(config.GPU),
		},
		Mode: swarm.ServiceMode{
			Replicated: &swarm.ReplicatedService{
				Replicas: &maxReplicas,
			},
		},
	}

	if len(config.Ports) > 0 {
		endpointSpec := &swarm.EndpointSpec{}
		for _, p := range config.Ports {
			portConfig := swarm.PortConfig{
				PublishedPort: uint32(p.HostPort),
				TargetPort:    uint32(p.ContainerPort),
				Protocol:      swarm.PortConfigProtocol(p.Protocol),
				PublishMode:   swarm.PortConfigPublishModeHost,
			}
			endpointSpec.Ports = append(endpointSpec.Ports, portConfig)
		}
		serviceSpec.EndpointSpec = endpointSpec
	}

	if len(config.Constraints) > 0 {
		if serviceSpec.TaskTemplate.Placement == nil {
			serviceSpec.TaskTemplate.Placement = &swarm.Placement{}
		}
		serviceSpec.TaskTemplate.Placement.Constraints = config.Constraints
	}

	if config.GPU != nil && config.GPU.Count > 0 {
		if serviceSpec.TaskTemplate.Placement == nil {
			serviceSpec.TaskTemplate.Placement = &swarm.Placement{}
		}
		serviceSpec.TaskTemplate.Placement.Constraints = append(
			serviceSpec.TaskTemplate.Placement.Constraints,
			"node.labels.gpu == true",
		)
	}

	serviceSpec.TaskTemplate.Resources = &swarm.ResourceRequirements{}
	
	if config.Resources != nil {
		serviceSpec.TaskTemplate.Resources.Limits = &swarm.Limit{
			NanoCPUs:    int64(config.Resources.CPUs * 1e9),
			MemoryBytes: config.Resources.Memory,
		}
	}

	if config.GPU != nil && config.GPU.Count > 0 {
		serviceSpec.TaskTemplate.Resources.Reservations = &swarm.Resources{
			GenericResources: []swarm.GenericResource{
				{
					NamedResourceSpec: &swarm.NamedResourceSpec{
						Kind:  "gpu",
						Value: int64(config.GPU.Count),
					},
				},
			},
		}
	}

	resp, err := c.docker.ServiceCreate(ctx, serviceSpec, types.ServiceCreateOptions{})
	if err != nil {
		return "", err
	}
	return resp.ID, nil
}

func getRuntime(gpu *GPUConfig) string {
	if gpu != nil && gpu.Count > 0 {
		return "nvidia"
	}
	return ""
}

func (c *Client) ListServices(ctx context.Context) ([]swarm.Service, error) {
	return c.docker.ServiceList(ctx, types.ServiceListOptions{})
}

func (c *Client) GetService(ctx context.Context, serviceID string) (*swarm.Service, error) {
	service, _, err := c.docker.ServiceInspectWithRaw(ctx, serviceID, types.ServiceInspectOptions{})
	if err != nil {
		return nil, err
	}
	return &service, nil
}

func (c *Client) RemoveService(ctx context.Context, serviceID string) error {
	return c.docker.ServiceRemove(ctx, serviceID)
}

func (c *Client) UpdateService(ctx context.Context, serviceID string, config ServiceConfig) error {
	service, _, err := c.docker.ServiceInspectWithRaw(ctx, serviceID, types.ServiceInspectOptions{})
	if err != nil {
		return err
	}

	if config.Replicas > 0 && service.Spec.Mode.Replicated != nil {
		maxReplicas := uint64(config.Replicas)
		service.Spec.Mode.Replicated.Replicas = &maxReplicas
	}

	if config.Name != "" {
		service.Spec.Annotations.Name = config.Name
	}
	if config.Labels != nil {
		service.Spec.Annotations.Labels = config.Labels
	}
	if config.Image != "" {
		service.Spec.TaskTemplate.ContainerSpec.Image = config.Image
	}
	if config.Env != nil {
		service.Spec.TaskTemplate.ContainerSpec.Env = config.Env
	}

	if len(config.Constraints) > 0 {
		if service.Spec.TaskTemplate.Placement == nil {
			service.Spec.TaskTemplate.Placement = &swarm.Placement{}
		}
		service.Spec.TaskTemplate.Placement.Constraints = config.Constraints
	}

	if config.Resources != nil {
		service.Spec.TaskTemplate.Resources = &swarm.ResourceRequirements{
			Limits: &swarm.Limit{
				NanoCPUs:    int64(config.Resources.CPUs * 1e9),
				MemoryBytes: config.Resources.Memory,
			},
		}
	}

	return c.docker.ServiceUpdate(ctx, serviceID, service.Version, service.Spec, types.ServiceUpdateOptions{})
}

func (c *Client) GetServiceTasks(ctx context.Context, serviceID string) ([]swarm.Task, error) {
	filter := filters.NewArgs()
	filter.Add("service", serviceID)
	return c.docker.TaskList(ctx, types.TaskListOptions{Filters: filter})
}

type Stats struct {
	CPUPercent    float64
	MemoryPercent float64
	MemoryUsage   int64
	MemoryLimit   int64
}

func (c *Client) GetContainerStats(ctx context.Context, containerID string) (*Stats, error) {
	resp, err := c.docker.ContainerStats(ctx, containerID, false)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var stats types.StatsJSON
	if err := stats.UnmarshalJSON(body); err != nil {
		return nil, err
	}

	cpuDelta := float64(stats.CPUStats.CPUUsage.TotalUsage) - float64(stats.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(stats.CPUStats.SystemUsage) - float64(stats.PreCPUStats.SystemUsage)
	cpuPercent := 0.0
	if systemDelta > 0 && cpuDelta > 0 {
		cpuPercent = (cpuDelta / systemDelta) * float64(len(stats.CPUStats.CPUUsage.PercpuUsage)) * 100.0
	}

	memoryUsage := stats.MemoryStats.Usage
	memoryLimit := stats.MemoryStats.Limit
	memoryPercent := float64(memoryUsage) / float64(memoryLimit) * 100.0

	return &Stats{
		CPUPercent:    cpuPercent,
		MemoryPercent: memoryPercent,
		MemoryUsage:   int64(memoryUsage),
		MemoryLimit:   int64(memoryLimit),
	}, nil
}

func (c *Client) ListContainers(ctx context.Context) ([]types.Container, error) {
	return c.docker.ContainerList(ctx, types.ContainerListOptions{All: true})
}

func (c *Client) CreateContainer(ctx context.Context, config *container.Config, hostConfig *container.HostConfig, name string) (string, error) {
	resp, err := c.docker.ContainerCreate(ctx, config, hostConfig, nil, nil, name)
	if err != nil {
		return "", err
	}
	return resp.ID, nil
}

func (c *Client) StartContainer(ctx context.Context, containerID string) error {
	return c.docker.ContainerStart(ctx, containerID, types.ContainerStartOptions{})
}

func (c *Client) StopContainer(ctx context.Context, containerID string, timeout time.Duration) error {
	return c.docker.ContainerStop(ctx, containerID, container.StopOptions{Timeout: &timeout})
}

func (c *Client) RemoveContainer(ctx context.Context, containerID string, force bool) error {
	return c.docker.ContainerRemove(ctx, containerID, types.ContainerRemoveOptions{Force: force})
}

func (c *Client) GetDockerInfo(ctx context.Context) (*types.Info, error) {
	info, err := c.docker.Info(ctx)
	if err != nil {
		return nil, err
	}
	return &info, nil
}

func (c *Client) GetGPUInfo(ctx context.Context) (*GPUInfo, error) {
	info, err := c.docker.Info(ctx)
	if err != nil {
		return nil, err
	}

	gpuInfo := &GPUInfo{
		Count:  0,
		Type:   "None",
		Driver: "None",
	}

	for _, runtime := range info.Runtimes {
		if runtime.Path == "nvidia-container-runtime" || runtime.Name == "nvidia" {
			gpuInfo.Driver = "nvidia"
			break
		}
	}

	return gpuInfo, nil
}
