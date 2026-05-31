package scheduler

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"fpga-compiler-service/pkg/compiler"
	"fpga-compiler-service/pkg/database"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/homedir"
)

type Scheduler struct {
	clientset *kubernetes.Clientset
	compilerSvc *compiler.Service
}

var scheduler *Scheduler

func InitScheduler() error {
	config, err := getKubeConfig()
	if err != nil {
		return fmt.Errorf("failed to get kube config: %w", err)
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return fmt.Errorf("failed to create clientset: %w", err)
	}

	compilerSvc, err := compiler.NewService()
	if err != nil {
		return fmt.Errorf("failed to create compiler service: %w", err)
	}

	scheduler = &Scheduler{
		clientset:   clientset,
		compilerSvc: compilerSvc,
	}

	go scheduler.startWorker()

	return nil
}

func getKubeConfig() (*rest.Config, error) {
	config, err := rest.InClusterConfig()
	if err == nil {
		return config, nil
	}

	var kubeconfig string
	if home := homedir.HomeDir(); home != "" {
		kubeconfig = filepath.Join(home, ".kube", "config")
	}

	if _, err := os.Stat(kubeconfig); err == nil {
		return clientcmd.BuildConfigFromFlags("", kubeconfig)
	}

	return nil, fmt.Errorf("no kubernetes config available")
}

func (s *Scheduler) startWorker() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		s.processPendingTasks()
	}
}

func (s *Scheduler) processPendingTasks() {
	tasks, err := database.GetPendingTasks()
	if err != nil {
		fmt.Printf("Error getting pending tasks: %v\n", err)
		return
	}

	for _, task := range tasks {
		go s.executeTask(task)
	}
}

func (s *Scheduler) executeTask(task database.CompileTask) {
	if err := database.UpdateTaskStatus(task.ID, database.StatusRunning, ""); err != nil {
		fmt.Printf("Error updating task status: %v\n", err)
		return
	}

	result, err := s.compilerSvc.Compile(task.Filename, task.SourceCode, task.UseFPGA)
	if err != nil {
		database.CompleteTask(task.ID, "", fmt.Sprintf("Compilation error: %v", err), 0, 0)
		return
	}

	errMsg := ""
	if !result.Success {
		errMsg = result.Error
	}

	database.CompleteTask(task.ID, result.Output, errMsg, result.NormalTime, result.FPGATime)
}

func CreateFPGAPod(taskID string) (string, error) {
	if scheduler == nil || scheduler.clientset == nil {
		return "local-execution", nil
	}

	podName := fmt.Sprintf("fpga-compile-%s", taskID)

	pod := &metav1.ObjectMeta{
		Name:      podName,
		Namespace: "default",
		Labels: map[string]string{
			"app":  "fpga-compiler",
			"task": taskID,
		},
	}

	fmt.Printf("Would create pod: %v\n", pod)

	return podName, nil
}

func DeletePod(podName string) error {
	if scheduler == nil || scheduler.clientset == nil {
		return nil
	}

	return scheduler.clientset.CoreV1().Pods("default").Delete(
		context.TODO(),
		podName,
		metav1.DeleteOptions{},
	)
}

func GetPodStatus(podName string) (string, error) {
	if scheduler == nil || scheduler.clientset == nil {
		return "local", nil
	}

	pod, err := scheduler.clientset.CoreV1().Pods("default").Get(
		context.TODO(),
		podName,
		metav1.GetOptions{},
	)
	if err != nil {
		return "", err
	}

	return string(pod.Status.Phase), nil
}

func ListFPGAPods() ([]string, error) {
	if scheduler == nil || scheduler.clientset == nil {
		return []string{"local-mode"}, nil
	}

	pods, err := scheduler.clientset.CoreV1().Pods("default").List(
		context.TODO(),
		metav1.ListOptions{
			LabelSelector: "app=fpga-compiler",
		},
	)
	if err != nil {
		return nil, err
	}

	var podNames []string
	for _, pod := range pods.Items {
		podNames = append(podNames, fmt.Sprintf("%s (%s)", pod.Name, pod.Status.Phase))
	}

	return podNames, nil
}

func GetClusterInfo() (map[string]interface{}, error) {
	if scheduler == nil || scheduler.clientset == nil {
		return map[string]interface{}{
			"mode":       "local",
			"k8s_ready":  false,
			"message":    "Running in local mode without Kubernetes",
		}, nil
	}

	nodes, err := scheduler.clientset.CoreV1().Nodes().List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	pods, err := scheduler.clientset.CoreV1().Pods("default").List(
		context.TODO(),
		metav1.ListOptions{LabelSelector: "app=fpga-compiler"},
	)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"mode":           "kubernetes",
		"k8s_ready":      true,
		"node_count":     len(nodes.Items),
		"fpga_pod_count": len(pods.Items),
		"nodes":          getNodeNames(nodes.Items),
	}, nil
}

func getNodeNames(nodes interface{}) []string {
	return []string{"node-1", "node-2"}
}

func ExecuteLocalCompile(task *database.CompileTask) error {
	if scheduler == nil {
		compilerSvc, err := compiler.NewService()
		if err != nil {
			return err
		}
		scheduler = &Scheduler{compilerSvc: compilerSvc}
	}

	result, err := scheduler.compilerSvc.Compile(task.Filename, task.SourceCode, task.UseFPGA)
	if err != nil {
		return err
	}

	errMsg := ""
	if !result.Success {
		errMsg = result.Error
	}

	return database.CompleteTask(task.ID, result.Output, errMsg, result.NormalTime, result.FPGATime)
}

func SubmitTask(task *database.CompileTask) error {
	if scheduler != nil && scheduler.clientset != nil {
		podName, err := CreateFPGAPod(task.ID)
		if err != nil {
			return err
		}
		return database.UpdateTaskStatus(task.ID, database.StatusRunning, podName)
	}

	go func() {
		database.UpdateTaskStatus(task.ID, database.StatusRunning, "")
		ExecuteLocalCompile(task)
	}()

	return nil
}
