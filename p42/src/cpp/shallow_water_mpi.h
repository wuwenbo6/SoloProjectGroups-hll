#ifndef SHALLOW_WATER_MPI_H
#define SHALLOW_WATER_MPI_H

#include <vector>
#include <string>

#ifdef USE_MPI
#include <mpi.h>
#endif

class ShallowWaterSolverMPI {
public:
    ShallowWaterSolverMPI(int global_nx, int global_ny, 
                          double dx, double dy,
                          double g = 9.81, double f = 1e-4, double dt = 0.1,
                          double viscosity = 100.0);
    
    ~ShallowWaterSolverMPI();
    
    void initialize(double mean_depth, double perturbation_amplitude = 0.0);
    void initialize_gaussian_bump(double mean_depth, double amp, 
                                   double x0, double y0, double sigma);
    
    void step();
    void run(int num_steps);
    
    const std::vector<double>& get_h_local() const { return h_; }
    const std::vector<double>& get_u_local() const { return u_; }
    const std::vector<double>& get_v_local() const { return v_; }
    
    std::vector<double> gather_global_h() const;
    std::vector<double> gather_global_u() const;
    std::vector<double> gather_global_v() const;
    
    int global_nx() const { return global_nx_; }
    int global_ny() const { return global_ny_; }
    int local_nx() const { return local_nx_; }
    int local_ny() const { return local_ny_; }
    double dx() const { return dx_; }
    double dy() const { return dy_; }
    double dt() const { return dt_; }
    int current_step() const { return current_step_; }
    int rank() const { return rank_; }
    int size() const { return size_; }
    
    static int init(int* argc, char*** argv);
    static void finalize();
    
private:
    int global_nx_, global_ny_;
    int local_nx_, local_ny_;
    int start_x_, start_y_;
    double dx_, dy_;
    double g_, f_, dt_, viscosity_;
    int current_step_;
    
    int rank_, size_;
    int px_, py_;
    int rank_x_, rank_y_;
    
    std::vector<double> h_, u_, v_;
    std::vector<double> h_new_, u_new_, v_new_;
    
    std::vector<double> halo_left_, halo_right_;
    std::vector<double> halo_top_, halo_bottom_;
    
    void decompose_domain();
    void exchange_halos();
    double get_h(int i, int j) const;
    double get_u(int i, int j) const;
    double get_v(int i, int j) const;
    void compute_tendencies();
    void apply_boundary_conditions();
};

#endif
