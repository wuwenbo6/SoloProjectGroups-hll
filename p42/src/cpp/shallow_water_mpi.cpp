#include "shallow_water_mpi.h"
#include <cmath>
#include <algorithm>
#include <iostream>

#ifdef USE_MPI

ShallowWaterSolverMPI::ShallowWaterSolverMPI(int global_nx, int global_ny,
                                              double dx, double dy,
                                              double g, double f, double dt,
                                              double viscosity)
    : global_nx_(global_nx), global_ny_(global_ny),
      dx_(dx), dy_(dy), g_(g), f_(f), dt_(dt), viscosity_(viscosity),
      current_step_(0), rank_(0), size_(1), px_(1), py_(1), rank_x_(0), rank_y_(0) {
    
    MPI_Comm_rank(MPI_COMM_WORLD, &rank_);
    MPI_Comm_size(MPI_COMM_WORLD, &size_);
    
    decompose_domain();
    
    local_nx_ += 2;
    local_ny_ += 2;
    
    int size = local_nx_ * local_ny_;
    h_.resize(size, 0.0);
    u_.resize(size, 0.0);
    v_.resize(size, 0.0);
    h_new_.resize(size, 0.0);
    u_new_.resize(size, 0.0);
    v_new_.resize(size, 0.0);
    
    halo_left_.resize(local_ny_, 0.0);
    halo_right_.resize(local_ny_, 0.0);
    halo_top_.resize(local_nx_, 0.0);
    halo_bottom_.resize(local_nx_, 0.0);
}

ShallowWaterSolverMPI::~ShallowWaterSolverMPI() {}

void ShallowWaterSolverMPI::decompose_domain() {
    px_ = static_cast<int>(std::sqrt(size_));
    while (size_ % px_ != 0 && px_ > 1) px_--;
    py_ = size_ / px_;
    
    rank_x_ = rank_ % px_;
    rank_y_ = rank_ / px_;
    
    local_nx_ = global_nx_ / px_;
    local_ny_ = global_ny_ / py_;
    
    start_x_ = rank_x_ * local_nx_;
    start_y_ = rank_y_ * local_ny_;
    
    if (rank_x_ == px_ - 1) local_nx_ += global_nx_ % px_;
    if (rank_y_ == py_ - 1) local_ny_ += global_ny_ % py_;
}

int ShallowWaterSolverMPI::init(int* argc, char*** argv) {
    return MPI_Init(argc, argv);
}

void ShallowWaterSolverMPI::finalize() {
    MPI_Finalize();
}

void ShallowWaterSolverMPI::initialize(double mean_depth, double perturbation_amplitude) {
    current_step_ = 0;
    for (int j = 1; j < local_ny_ - 1; ++j) {
        for (int i = 1; i < local_nx_ - 1; ++i) {
            int idx = j * local_nx_ + i;
            h_[idx] = mean_depth;
            u_[idx] = 0.0;
            v_[idx] = 0.0;
        }
    }
}

void ShallowWaterSolverMPI::initialize_gaussian_bump(double mean_depth, double amp,
                                                      double x0, double y0, double sigma) {
    initialize(mean_depth);
    for (int j = 1; j < local_ny_ - 1; ++j) {
        for (int i = 1; i < local_nx_ - 1; ++i) {
            double x = (start_x_ + i - 1) * dx_;
            double y = (start_y_ + j - 1) * dy_;
            double r2 = (x - x0) * (x - x0) + (y - y0) * (y - y0);
            int idx = j * local_nx_ + i;
            h_[idx] = mean_depth + amp * std::exp(-r2 / (2.0 * sigma * sigma));
        }
    }
}

void ShallowWaterSolverMPI::exchange_halos() {
    MPI_Request req[8];
    int nreq = 0;
    
    if (rank_x_ > 0) {
        std::vector<double> send_left(local_ny_);
        for (int j = 0; j < local_ny_; ++j) send_left[j] = h_[j * local_nx_ + 1];
        MPI_Isend(send_left.data(), local_ny_, MPI_DOUBLE,
                  rank_ - 1, 0, MPI_COMM_WORLD, &req[nreq++]);
        MPI_Irecv(halo_left_.data(), local_ny_, MPI_DOUBLE,
                  rank_ - 1, 1, MPI_COMM_WORLD, &req[nreq++]);
    }
    
    if (rank_x_ < px_ - 1) {
        std::vector<double> send_right(local_ny_);
        for (int j = 0; j < local_ny_; ++j) send_right[j] = h_[j * local_nx_ + local_nx_ - 2];
        MPI_Isend(send_right.data(), local_ny_, MPI_DOUBLE,
                  rank_ + 1, 1, MPI_COMM_WORLD, &req[nreq++]);
        MPI_Irecv(halo_right_.data(), local_ny_, MPI_DOUBLE,
                  rank_ + 1, 0, MPI_COMM_WORLD, &req[nreq++]);
    }
    
    if (rank_y_ > 0) {
        std::vector<double> send_bottom(local_nx_);
        for (int i = 0; i < local_nx_; ++i) send_bottom[i] = h_[local_nx_ + i];
        MPI_Isend(send_bottom.data(), local_nx_, MPI_DOUBLE,
                  rank_ - px_, 2, MPI_COMM_WORLD, &req[nreq++]);
        MPI_Irecv(halo_bottom_.data(), local_nx_, MPI_DOUBLE,
                  rank_ - px_, 3, MPI_COMM_WORLD, &req[nreq++]);
    }
    
    if (rank_y_ < py_ - 1) {
        std::vector<double> send_top(local_nx_);
        for (int i = 0; i < local_nx_; ++i) send_top[i] = h_[(local_ny_ - 2) * local_nx_ + i];
        MPI_Isend(send_top.data(), local_nx_, MPI_DOUBLE,
                  rank_ + px_, 3, MPI_COMM_WORLD, &req[nreq++]);
        MPI_Irecv(halo_top_.data(), local_nx_, MPI_DOUBLE,
                  rank_ + px_, 2, MPI_COMM_WORLD, &req[nreq++]);
    }
    
    MPI_Waitall(nreq, req, MPI_STATUSES_IGNORE);
    
    if (rank_x_ > 0) {
        for (int j = 0; j < local_ny_; ++j) h_[j * local_nx_ + 0] = halo_left_[j];
    }
    if (rank_x_ < px_ - 1) {
        for (int j = 0; j < local_ny_; ++j) h_[j * local_nx_ + local_nx_ - 1] = halo_right_[j];
    }
    if (rank_y_ > 0) {
        for (int i = 0; i < local_nx_; ++i) h_[0 * local_nx_ + i] = halo_bottom_[i];
    }
    if (rank_y_ < py_ - 1) {
        for (int i = 0; i < local_nx_; ++i) h_[(local_ny_ - 1) * local_nx_ + i] = halo_top_[i];
    }
}

double ShallowWaterSolverMPI::get_h(int i, int j) const {
    return h_[j * local_nx_ + i];
}

double ShallowWaterSolverMPI::get_u(int i, int j) const {
    return u_[j * local_nx_ + i];
}

double ShallowWaterSolverMPI::get_v(int i, int j) const {
    return v_[j * local_nx_ + i];
}

void ShallowWaterSolverMPI::compute_tendencies() {
    const double dx_inv = 1.0 / dx_;
    const double dy_inv = 1.0 / dy_;
    const double dx2_inv = 1.0 / (dx_ * dx_);
    const double dy2_inv = 1.0 / (dy_ * dy_);
    
    for (int j = 1; j < local_ny_ - 1; ++j) {
        for (int i = 1; i < local_nx_ - 1; ++i) {
            int idx = j * local_nx_ + i;
            double h = h_[idx];
            double u = u_[idx];
            double v = v_[idx];
            
            double h_x = (h_[idx + 1] - h_[idx - 1]) * 0.5 * dx_inv;
            double h_y = (h_[idx + local_nx_] - h_[idx - local_nx_]) * 0.5 * dy_inv;
            
            double hu = h * u;
            double hv = h * v;
            double hu_x = (h_[idx + 1] * u_[idx + 1] - h_[idx - 1] * u_[idx - 1]) * 0.5 * dx_inv;
            double hv_y = (h_[idx + local_nx_] * v_[idx + local_nx_] - 
                           h_[idx - local_nx_] * v_[idx - local_nx_]) * 0.5 * dy_inv;
            
            double u_x = (u_[idx + 1] - u_[idx - 1]) * 0.5 * dx_inv;
            double u_y = (u_[idx + local_nx_] - u_[idx - local_nx_]) * 0.5 * dy_inv;
            double v_x = (v_[idx + 1] - v_[idx - 1]) * 0.5 * dx_inv;
            double v_y = (v_[idx + local_nx_] - v_[idx - local_nx_]) * 0.5 * dy_inv;
            
            double h_new = h - dt_ * (hu_x + hv_y);
            double u_new = u - dt_ * (u * u_x + v * u_y + g_ * h_x - f_ * v);
            double v_new = v - dt_ * (u * v_x + v * v_y + g_ * h_y + f_ * u);
            
            if (viscosity_ > 0.0) {
                double h_lap = (h_[idx + 1] + h_[idx - 1] - 2.0 * h) * dx2_inv +
                               (h_[idx + local_nx_] + h_[idx - local_nx_] - 2.0 * h) * dy2_inv;
                double u_lap = (u_[idx + 1] + u_[idx - 1] - 2.0 * u) * dx2_inv +
                               (u_[idx + local_nx_] + u_[idx - local_nx_] - 2.0 * u) * dy2_inv;
                double v_lap = (v_[idx + 1] + v_[idx - 1] - 2.0 * v) * dx2_inv +
                               (v_[idx + local_nx_] + v_[idx - local_nx_] - 2.0 * v) * dy2_inv;
                
                h_new += dt_ * viscosity_ * h_lap;
                u_new += dt_ * viscosity_ * u_lap;
                v_new += dt_ * viscosity_ * v_lap;
            }
            
            h_new_[idx] = h_new;
            u_new_[idx] = u_new;
            v_new_[idx] = v_new;
        }
    }
}

void ShallowWaterSolverMPI::apply_boundary_conditions() {
    if (rank_x_ == 0) {
        for (int j = 0; j < local_ny_; ++j) {
            h_new_[j * local_nx_ + 1] = h_new_[j * local_nx_ + 2];
            u_new_[j * local_nx_ + 1] = 0.0;
        }
    }
    if (rank_x_ == px_ - 1) {
        for (int j = 0; j < local_ny_; ++j) {
            h_new_[j * local_nx_ + local_nx_ - 2] = h_new_[j * local_nx_ + local_nx_ - 3];
            u_new_[j * local_nx_ + local_nx_ - 2] = 0.0;
        }
    }
    if (rank_y_ == 0) {
        for (int i = 0; i < local_nx_; ++i) {
            h_new_[1 * local_nx_ + i] = h_new_[2 * local_nx_ + i];
            v_new_[1 * local_nx_ + i] = 0.0;
        }
    }
    if (rank_y_ == py_ - 1) {
        for (int i = 0; i < local_nx_; ++i) {
            h_new_[(local_ny_ - 2) * local_nx_ + i] = h_new_[(local_ny_ - 3) * local_nx_ + i];
            v_new_[(local_ny_ - 2) * local_nx_ + i] = 0.0;
        }
    }
}

void ShallowWaterSolverMPI::step() {
    h_new_ = h_;
    u_new_ = u_;
    v_new_ = v_;
    
    exchange_halos();
    compute_tendencies();
    apply_boundary_conditions();
    
    for (int j = 1; j < local_ny_ - 1; ++j) {
        for (int i = 1; i < local_nx_ - 1; ++i) {
            int idx = j * local_nx_ + i;
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

void ShallowWaterSolverMPI::run(int num_steps) {
    for (int i = 0; i < num_steps; ++i) {
        step();
    }
}

std::vector<double> ShallowWaterSolverMPI::gather_global_h() const {
    std::vector<double> global;
    if (rank_ == 0) global.resize(global_nx_ * global_ny_);
    
    std::vector<double> local_data;
    for (int j = 1; j < local_ny_ - 1; ++j) {
        for (int i = 1; i < local_nx_ - 1; ++i) {
            local_data.push_back(h_[j * local_nx_ + i]);
        }
    }
    
    std::vector<int> sendcounts(size_), displs(size_);
    if (rank_ == 0) {
        for (int r = 0; r < size_; ++r) {
            int rx = r % px_;
            int ry = r / px_;
            int lnx = global_nx_ / px_ + (rx == px_ - 1 ? global_nx_ % px_ : 0);
            int lny = global_ny_ / py_ + (ry == py_ - 1 ? global_ny_ % py_ : 0);
            sendcounts[r] = lnx * lny;
        }
        displs[0] = 0;
        for (int r = 1; r < size_; ++r) displs[r] = displs[r-1] + sendcounts[r-1];
    }
    
    MPI_Gatherv(local_data.data(), local_data.size(), MPI_DOUBLE,
                global.data(), sendcounts.data(), displs.data(), MPI_DOUBLE,
                0, MPI_COMM_WORLD);
    
    return global;
}

std::vector<double> ShallowWaterSolverMPI::gather_global_u() const {
    return gather_global_h();
}

std::vector<double> ShallowWaterSolverMPI::gather_global_v() const {
    return gather_global_h();
}

#else

ShallowWaterSolverMPI::ShallowWaterSolverMPI(int global_nx, int global_ny,
                                              double dx, double dy,
                                              double g, double f, double dt,
                                              double viscosity) {
    throw std::runtime_error("MPI support not compiled. Recompile with USE_MPI=ON");
}

ShallowWaterSolverMPI::~ShallowWaterSolverMPI() {}
int ShallowWaterSolverMPI::init(int* argc, char*** argv) { return 0; }
void ShallowWaterSolverMPI::finalize() {}
void ShallowWaterSolverMPI::initialize(double, double) {}
void ShallowWaterSolverMPI::initialize_gaussian_bump(double, double, double, double, double) {}
void ShallowWaterSolverMPI::step() {}
void ShallowWaterSolverMPI::run(int) {}
const std::vector<double>& ShallowWaterSolverMPI::get_h_local() const { static std::vector<double> d; return d; }
const std::vector<double>& ShallowWaterSolverMPI::get_u_local() const { static std::vector<double> d; return d; }
const std::vector<double>& ShallowWaterSolverMPI::get_v_local() const { static std::vector<double> d; return d; }
std::vector<double> ShallowWaterSolverMPI::gather_global_h() const { return {}; }
std::vector<double> ShallowWaterSolverMPI::gather_global_u() const { return {}; }
std::vector<double> ShallowWaterSolverMPI::gather_global_v() const { return {}; }
int ShallowWaterSolverMPI::global_nx() const { return 0; }
int ShallowWaterSolverMPI::global_ny() const { return 0; }
int ShallowWaterSolverMPI::local_nx() const { return 0; }
int ShallowWaterSolverMPI::local_ny() const { return 0; }
double ShallowWaterSolverMPI::dx() const { return 0; }
double ShallowWaterSolverMPI::dy() const { return 0; }
double ShallowWaterSolverMPI::dt() const { return 0; }
int ShallowWaterSolverMPI::current_step() const { return 0; }
int ShallowWaterSolverMPI::rank() const { return 0; }
int ShallowWaterSolverMPI::size() const { return 1; }

#endif
