#ifndef SHALLOW_WATER_SOLVER_H
#define SHALLOW_WATER_SOLVER_H

#include <vector>
#include <string>

class ShallowWaterSolver {
public:
    ShallowWaterSolver(int nx, int ny, double dx, double dy,
                       double g = 9.81, double f = 1e-4, double dt = 0.1,
                       double viscosity = 100.0);
    
    ~ShallowWaterSolver();
    
    void initialize(double mean_depth, double perturbation_amplitude = 0.0);
    void initialize_gaussian_bump(double mean_depth, double amp, double x0, double y0, double sigma);
    
    void step();
    void run(int num_steps);
    
    const std::vector<double>& get_h() const { return h_; }
    const std::vector<double>& get_u() const { return u_; }
    const std::vector<double>& get_v() const { return v_; }
    
    void set_h(const std::vector<double>& h);
    void set_u(const std::vector<double>& u);
    void set_v(const std::vector<double>& v);
    
    int nx() const { return nx_; }
    int ny() const { return ny_; }
    double dx() const { return dx_; }
    double dy() const { return dy_; }
    double dt() const { return dt_; }
    int current_step() const { return current_step_; }
    
    void apply_bathymetry(const std::vector<double>& bathymetry);
    
private:
    int nx_, ny_;
    double dx_, dy_;
    double g_, f_, dt_;
    double viscosity_;
    int current_step_;
    
    std::vector<double> h_, u_, v_;
    std::vector<double> h_new_, u_new_, v_new_;
    std::vector<double> bathymetry_;
    
    double get_h(int i, int j) const;
    double get_u(int i, int j) const;
    double get_v(int i, int j) const;
    
    void set_h_new(int i, int j, double val);
    void set_u_new(int i, int j, double val);
    void set_v_new(int i, int j, double val);
    
    void compute_tendencies();
    void apply_boundary_conditions();
};

#endif
