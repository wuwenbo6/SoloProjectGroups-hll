#include "shallow_water_solver.h"
#include <cmath>
#include <algorithm>
#include <iostream>

ShallowWaterSolver::ShallowWaterSolver(int nx, int ny, double dx, double dy,
                                       double g, double f, double dt, double viscosity)
    : nx_(nx), ny_(ny), dx_(dx), dy_(dy), g_(g), f_(f), dt_(dt), 
      viscosity_(viscosity), current_step_(0) {
    int size = nx_ * ny_;
    h_.resize(size, 0.0);
    u_.resize(size, 0.0);
    v_.resize(size, 0.0);
    h_new_.resize(size, 0.0);
    u_new_.resize(size, 0.0);
    v_new_.resize(size, 0.0);
    bathymetry_.resize(size, 0.0);
}

ShallowWaterSolver::~ShallowWaterSolver() {}

void ShallowWaterSolver::initialize(double mean_depth, double perturbation_amplitude) {
    current_step_ = 0;
    for (int j = 0; j < ny_; ++j) {
        for (int i = 0; i < nx_; ++i) {
            int idx = j * nx_ + i;
            h_[idx] = mean_depth;
            u_[idx] = 0.0;
            v_[idx] = 0.0;
        }
    }
}

void ShallowWaterSolver::initialize_gaussian_bump(double mean_depth, double amp, 
                                                   double x0, double y0, double sigma) {
    initialize(mean_depth);
    for (int j = 0; j < ny_; ++j) {
        for (int i = 0; i < nx_; ++i) {
            double x = i * dx_;
            double y = j * dy_;
            double r2 = (x - x0) * (x - x0) + (y - y0) * (y - y0);
            int idx = j * nx_ + i;
            h_[idx] = mean_depth + amp * std::exp(-r2 / (2.0 * sigma * sigma));
        }
    }
}

void ShallowWaterSolver::apply_bathymetry(const std::vector<double>& bathymetry) {
    if (bathymetry.size() == static_cast<size_t>(nx_ * ny_)) {
        bathymetry_ = bathymetry;
    }
}

double ShallowWaterSolver::get_h(int i, int j) const {
    i = std::max(0, std::min(nx_ - 1, i));
    j = std::max(0, std::min(ny_ - 1, j));
    return h_[j * nx_ + i];
}

double ShallowWaterSolver::get_u(int i, int j) const {
    i = std::max(0, std::min(nx_ - 1, i));
    j = std::max(0, std::min(ny_ - 1, j));
    return u_[j * nx_ + i];
}

double ShallowWaterSolver::get_v(int i, int j) const {
    i = std::max(0, std::min(nx_ - 1, i));
    j = std::max(0, std::min(ny_ - 1, j));
    return v_[j * nx_ + i];
}

void ShallowWaterSolver::set_h_new(int i, int j, double val) {
    if (i >= 0 && i < nx_ && j >= 0 && j < ny_) {
        h_new_[j * nx_ + i] = val;
    }
}

void ShallowWaterSolver::set_u_new(int i, int j, double val) {
    if (i >= 0 && i < nx_ && j >= 0 && j < ny_) {
        u_new_[j * nx_ + i] = val;
    }
}

void ShallowWaterSolver::set_v_new(int i, int j, double val) {
    if (i >= 0 && i < nx_ && j >= 0 && j < ny_) {
        v_new_[j * nx_ + i] = val;
    }
}

void ShallowWaterSolver::compute_tendencies() {
    const double dx_inv = 1.0 / dx_;
    const double dy_inv = 1.0 / dy_;
    const double dx2_inv = 1.0 / (dx_ * dx_);
    const double dy2_inv = 1.0 / (dy_ * dy_);
    
    for (int j = 1; j < ny_ - 1; ++j) {
        for (int i = 1; i < nx_ - 1; ++i) {
            double h = get_h(i, j);
            double u = get_u(i, j);
            double v = get_v(i, j);
            
            double h_x = (get_h(i + 1, j) - get_h(i - 1, j)) * 0.5 * dx_inv;
            double h_y = (get_h(i, j + 1) - get_h(i, j - 1)) * 0.5 * dy_inv;
            
            double hu = h * u;
            double hv = h * v;
            double hu_ip = get_h(i + 1, j) * get_u(i + 1, j);
            double hu_im = get_h(i - 1, j) * get_u(i - 1, j);
            double hv_jp = get_h(i, j + 1) * get_v(i, j + 1);
            double hv_jm = get_h(i, j - 1) * get_v(i, j - 1);
            
            double hu_x = (hu_ip - hu_im) * 0.5 * dx_inv;
            double hv_y = (hv_jp - hv_jm) * 0.5 * dy_inv;
            
            double u_x = (get_u(i + 1, j) - get_u(i - 1, j)) * 0.5 * dx_inv;
            double u_y = (get_u(i, j + 1) - get_u(i, j - 1)) * 0.5 * dy_inv;
            double v_x = (get_v(i + 1, j) - get_v(i - 1, j)) * 0.5 * dx_inv;
            double v_y = (get_v(i, j + 1) - get_v(i, j - 1)) * 0.5 * dy_inv;
            
            double h_new = h - dt_ * (hu_x + hv_y);
            
            double u_new = u - dt_ * (u * u_x + v * u_y + g_ * h_x - f_ * v);
            double v_new = v - dt_ * (u * v_x + v * v_y + g_ * h_y + f_ * u);
            
            if (viscosity_ > 0.0) {
                double h_lap = (get_h(i + 1, j) + get_h(i - 1, j) - 2.0 * h) * dx2_inv +
                               (get_h(i, j + 1) + get_h(i, j - 1) - 2.0 * h) * dy2_inv;
                double u_lap = (get_u(i + 1, j) + get_u(i - 1, j) - 2.0 * u) * dx2_inv +
                               (get_u(i, j + 1) + get_u(i, j - 1) - 2.0 * u) * dy2_inv;
                double v_lap = (get_v(i + 1, j) + get_v(i - 1, j) - 2.0 * v) * dx2_inv +
                               (get_v(i, j + 1) + get_v(i, j - 1) - 2.0 * v) * dy2_inv;
                
                h_new += dt_ * viscosity_ * h_lap;
                u_new += dt_ * viscosity_ * u_lap;
                v_new += dt_ * viscosity_ * v_lap;
            }
            
            set_h_new(i, j, h_new);
            set_u_new(i, j, u_new);
            set_v_new(i, j, v_new);
        }
    }
}

void ShallowWaterSolver::apply_boundary_conditions() {
    for (int j = 0; j < ny_; ++j) {
        set_h_new(0, j, h_new_[j * nx_ + 1]);
        set_h_new(nx_ - 1, j, h_new_[j * nx_ + nx_ - 2]);
        set_u_new(0, j, 0.0);
        set_u_new(nx_ - 1, j, 0.0);
        set_v_new(0, j, v_new_[j * nx_ + 1]);
        set_v_new(nx_ - 1, j, v_new_[j * nx_ + nx_ - 2]);
    }
    
    for (int i = 0; i < nx_; ++i) {
        set_h_new(i, 0, h_new_[nx_ + i]);
        set_h_new(i, ny_ - 1, h_new_[(ny_ - 2) * nx_ + i]);
        set_u_new(i, 0, u_new_[nx_ + i]);
        set_u_new(i, ny_ - 1, u_new_[(ny_ - 2) * nx_ + i]);
        set_v_new(i, 0, 0.0);
        set_v_new(i, ny_ - 1, 0.0);
    }
}

void ShallowWaterSolver::step() {
    h_new_ = h_;
    u_new_ = u_;
    v_new_ = v_;
    
    compute_tendencies();
    apply_boundary_conditions();
    
    for (int j = 0; j < ny_; ++j) {
        for (int i = 0; i < nx_; ++i) {
            int idx = j * nx_ + i;
            if (h_new_[idx] < 0.1) {
                h_new_[idx] = 0.1;
                u_new_[idx] = 0.0;
                v_new_[idx] = 0.0;
            }
        }
    }
    
    std::swap(h_, h_new_);
    std::swap(u_, u_new_);
    std::swap(v_, v_new_);
    
    current_step_++;
}

void ShallowWaterSolver::run(int num_steps) {
    for (int i = 0; i < num_steps; ++i) {
        step();
    }
}

void ShallowWaterSolver::set_h(const std::vector<double>& h) {
    if (h.size() == h_.size()) {
        h_ = h;
    }
}

void ShallowWaterSolver::set_u(const std::vector<double>& u) {
    if (u.size() == u_.size()) {
        u_ = u;
    }
}

void ShallowWaterSolver::set_v(const std::vector<double>& v) {
    if (v.size() == v_.size()) {
        v_ = v;
    }
}
