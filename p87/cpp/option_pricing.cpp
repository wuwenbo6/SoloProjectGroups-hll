#include "option_pricing.h"
#include <cmath>
#include <random>
#include <algorithm>
#include <chrono>
#include <iostream>
#include <vector>

#ifdef _OPENMP
#include <omp.h>
#else
#define omp_get_thread_num() 0
#endif

double normal_cdf(double x) {
    return 0.5 * std::erfc(-x / std::sqrt(2.0));
}

double black_scholes_price(const std::string& option_type, double S0, double K, double T, double r, double sigma) {
    double d1 = (std::log(S0 / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * std::sqrt(T));
    double d2 = d1 - sigma * std::sqrt(T);
    
    if (option_type == "call") {
        return S0 * normal_cdf(d1) - K * std::exp(-r * T) * normal_cdf(d2);
    } else {
        return K * std::exp(-r * T) * normal_cdf(-d2) - S0 * normal_cdf(-d1);
    }
}

PricingResult price_european_option(
    const std::string& option_type,
    double S0,
    double K,
    double T,
    double r,
    double sigma,
    int num_paths
) {
    auto start_time = std::chrono::high_resolution_clock::now();
    
    double drift = (r - 0.5 * sigma * sigma) * T;
    double diffusion = sigma * std::sqrt(T);
    
    double sum_payoff = 0.0;
    double sum_sq_payoff = 0.0;
    
    const int chunk_size = 100000;
    int num_chunks = (num_paths + chunk_size - 1) / chunk_size;
    
    #pragma omp parallel
    {
        std::random_device rd;
        std::mt19937 gen(rd() + omp_get_thread_num());
        std::normal_distribution<> normal(0.0, 1.0);
        
        double thread_sum = 0.0;
        double thread_sum_sq = 0.0;
        
        #pragma omp for
        for (int chunk = 0; chunk < num_chunks; ++chunk) {
            int start = chunk * chunk_size;
            int end = std::min(start + chunk_size, num_paths);
            int count = end - start;
            
            for (int i = 0; i < count; ++i) {
                double Z = normal(gen);
                double ST = S0 * std::exp(drift + diffusion * Z);
                double payoff;
                
                if (option_type == "call") {
                    payoff = std::max(ST - K, 0.0);
                } else {
                    payoff = std::max(K - ST, 0.0);
                }
                
                thread_sum += payoff;
                thread_sum_sq += payoff * payoff;
            }
        }
        
        #pragma omp critical
        {
            sum_payoff += thread_sum;
            sum_sq_payoff += thread_sum_sq;
        }
    }
    
    double discount = std::exp(-r * T);
    double price = discount * sum_payoff / num_paths;
    
    double variance = (sum_sq_payoff / num_paths - (sum_payoff / num_paths) * (sum_payoff / num_paths)) 
                      * num_paths / (num_paths - 1);
    double std_dev = std::sqrt(variance);
    double std_error = std_dev / std::sqrt(num_paths);
    double margin = 1.96 * std_error;
    
    auto end_time = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double> elapsed = end_time - start_time;
    
    PricingResult result;
    result.price = price;
    result.ci_lower = price - margin;
    result.ci_upper = price + margin;
    result.std_error = std_error;
    result.time_taken = elapsed.count();
    
    return result;
}

PricingResult price_asian_option(
    const std::string& option_type,
    double S0,
    double K,
    double T,
    double r,
    double sigma,
    int num_paths,
    int num_steps
) {
    auto start_time = std::chrono::high_resolution_clock::now();
    
    double dt = T / num_steps;
    double drift = (r - 0.5 * sigma * sigma) * dt;
    double diffusion = sigma * std::sqrt(dt);
    
    double sigma_sq_dt = sigma * sigma * dt;
    double drift_sum = (r - 0.5 * sigma * sigma) * T * (num_steps + 1) / (2.0 * num_steps);
    double vol_sum = sigma * std::sqrt(T * (2 * num_steps + 1) / (6.0 * num_steps));
    
    double sum_payoff = 0.0;
    double sum_sq_payoff = 0.0;
    
    const int chunk_size = 10000;
    int num_chunks = (num_paths + chunk_size - 1) / chunk_size;
    
    #pragma omp parallel
    {
        std::random_device rd;
        std::mt19937 gen(rd() + omp_get_thread_num());
        std::normal_distribution<> normal(0.0, 1.0);
        
        double thread_sum = 0.0;
        double thread_sum_sq = 0.0;
        
        #pragma omp for
        for (int chunk = 0; chunk < num_chunks; ++chunk) {
            int start = chunk * chunk_size;
            int end = std::min(start + chunk_size, num_paths);
            int count = end - start;
            
            for (int i = 0; i < count; ++i) {
                double S = S0;
                double sum_S = S0;
                double log_sum = std::log(S0);
                
                for (int j = 1; j <= num_steps; ++j) {
                    double Z = normal(gen);
                    S *= std::exp(drift + diffusion * Z);
                    sum_S += S;
                    log_sum += std::log(S);
                }
                
                double avg_S = sum_S / (num_steps + 1);
                double geo_avg = std::exp(log_sum / (num_steps + 1));
                
                double payoff_arith, payoff_geo;
                if (option_type == "call") {
                    payoff_arith = std::max(avg_S - K, 0.0);
                    payoff_geo = std::max(geo_avg - K, 0.0);
                } else {
                    payoff_arith = std::max(K - avg_S, 0.0);
                    payoff_geo = std::max(K - geo_avg, 0.0);
                }
                
                thread_sum += payoff_arith;
                thread_sum_sq += payoff_arith * payoff_arith;
            }
        }
        
        #pragma omp critical
        {
            sum_payoff += thread_sum;
            sum_sq_payoff += thread_sum_sq;
        }
    }
    
    double discount = std::exp(-r * T);
    double price = discount * sum_payoff / num_paths;
    
    double mean_payoff = sum_payoff / num_paths;
    double variance = (sum_sq_payoff / num_paths - mean_payoff * mean_payoff) * num_paths / (num_paths - 1);
    double std_dev = std::sqrt(std::max(variance, 0.0));
    double std_error = std_dev / std::sqrt(num_paths);
    double margin = 1.96 * std_error;
    
    auto end_time = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double> elapsed = end_time - start_time;
    
    PricingResult result;
    result.price = price;
    result.ci_lower = price - margin;
    result.ci_upper = price + margin;
    result.std_error = std_error;
    result.time_taken = elapsed.count();
    
    return result;
}

PricingResult price_american_option(
    const std::string& option_type,
    double S0,
    double K,
    double T,
    double r,
    double sigma,
    int num_paths,
    int num_steps
) {
    auto start_time = std::chrono::high_resolution_clock::now();
    
    double dt = T / num_steps;
    double discount = std::exp(-r * dt);
    double drift = (r - 0.5 * sigma * sigma) * dt;
    double diffusion = sigma * std::sqrt(dt);
    
    const int num_training_paths = std::min(num_paths / 2, 50000);
    const int num_pricing_paths = num_paths - num_training_paths;
    
    std::vector<std::vector<double>> training_paths(num_training_paths, std::vector<double>(num_steps + 1));
    std::vector<std::vector<double>> pricing_paths(num_pricing_paths, std::vector<double>(num_steps + 1));
    
    #pragma omp parallel
    {
        std::random_device rd;
        std::mt19937 gen(rd() + omp_get_thread_num());
        std::normal_distribution<> normal(0.0, 1.0);
        
        #pragma omp for
        for (int i = 0; i < num_training_paths; ++i) {
            training_paths[i][0] = S0;
            for (int t = 1; t <= num_steps; ++t) {
                double Z = normal(gen);
                training_paths[i][t] = training_paths[i][t-1] * std::exp(drift + diffusion * Z);
            }
        }
        
        #pragma omp for
        for (int i = 0; i < num_pricing_paths; ++i) {
            pricing_paths[i][0] = S0;
            for (int t = 1; t <= num_steps; ++t) {
                double Z = normal(gen);
                pricing_paths[i][t] = pricing_paths[i][t-1] * std::exp(drift + diffusion * Z);
            }
        }
    }
    
    std::vector<double> cashflow(num_training_paths);
    for (int i = 0; i < num_training_paths; ++i) {
        double ST = training_paths[i][num_steps];
        if (option_type == "call") {
            cashflow[i] = std::max(ST - K, 0.0);
        } else {
            cashflow[i] = std::max(K - ST, 0.0);
        }
    }
    
    for (int t = num_steps - 1; t >= 1; --t) {
        std::vector<double> X, Y;
        std::vector<int> indices;
        
        for (int i = 0; i < num_training_paths; ++i) {
            double St = training_paths[i][t];
            double exercise_value;
            
            if (option_type == "call") {
                exercise_value = std::max(St - K, 0.0);
            } else {
                exercise_value = std::max(K - St, 0.0);
            }
            
            if (exercise_value > 0) {
                X.push_back(St);
                Y.push_back(cashflow[i] * discount);
                indices.push_back(i);
            }
        }
        
        if (X.size() >= 3) {
            double sum_x = 0, sum_x2 = 0, sum_x3 = 0, sum_x4 = 0;
            double sum_y = 0, sum_xy = 0, sum_x2y = 0;
            int n = X.size();
            
            for (int i = 0; i < n; ++i) {
                double x = X[i] / S0;
                double y = Y[i];
                sum_x += x;
                sum_x2 += x * x;
                sum_x3 += x * x * x;
                sum_x4 += x * x * x * x;
                sum_y += y;
                sum_xy += x * y;
                sum_x2y += x * x * y;
            }
            
            double A[3][3] = {
                {static_cast<double>(n), sum_x, sum_x2},
                {sum_x, sum_x2, sum_x3},
                {sum_x2, sum_x3, sum_x4}
            };
            double B[3] = {sum_y, sum_xy, sum_x2y};
            
            for (int i = 0; i < 3; ++i) {
                int max_row = i;
                for (int j = i + 1; j < 3; ++j) {
                    if (std::abs(A[j][i]) > std::abs(A[max_row][i])) {
                        max_row = j;
                    }
                }
                for (int k = i; k < 3; ++k) {
                    std::swap(A[i][k], A[max_row][k]);
                }
                std::swap(B[i], B[max_row]);
                
                for (int j = i + 1; j < 3; ++j) {
                    double factor = A[j][i] / A[i][i];
                    for (int k = i; k < 3; ++k) {
                        A[j][k] -= factor * A[i][k];
                    }
                    B[j] -= factor * B[i];
                }
            }
            
            double coeff[3];
            for (int i = 2; i >= 0; --i) {
                coeff[i] = B[i];
                for (int j = i + 1; j < 3; ++j) {
                    coeff[i] -= A[i][j] * coeff[j];
                }
                coeff[i] /= A[i][i];
            }
            
            for (int i = 0; i < n; ++i) {
                double x = X[i] / S0;
                double continuation = coeff[0] + coeff[1] * x + coeff[2] * x * x;
                double exercise_value;
                
                if (option_type == "call") {
                    exercise_value = std::max(X[i] - K, 0.0);
                } else {
                    exercise_value = std::max(K - X[i], 0.0);
                }
                
                if (exercise_value > continuation) {
                    cashflow[indices[i]] = exercise_value;
                } else {
                    cashflow[indices[i]] *= discount;
                }
            }
        }
        
        for (int i = 0; i < num_training_paths; ++i) {
            bool in_money = (option_type == "call") ? (training_paths[i][t] > K) : (training_paths[i][t] < K);
            if (!in_money) {
                cashflow[i] *= discount;
            }
        }
    }
    
    std::vector<double> pricing_cashflow(num_pricing_paths);
    for (int i = 0; i < num_pricing_paths; ++i) {
        pricing_cashflow[i] = cashflow[i % num_training_paths];
    }
    
    double sum_payoff = 0.0;
    double sum_sq_payoff = 0.0;
    
    #pragma omp parallel for reduction(+:sum_payoff, sum_sq_payoff)
    for (int i = 0; i < num_pricing_paths; ++i) {
        double cf = pricing_cashflow[i];
        sum_payoff += cf;
        sum_sq_payoff += cf * cf;
    }
    
    double price = sum_payoff / num_pricing_paths;
    double mean = sum_payoff / num_pricing_paths;
    double variance = (sum_sq_payoff / num_pricing_paths - mean * mean) * num_pricing_paths / (num_pricing_paths - 1);
    double std_dev = std::sqrt(std::max(variance, 0.0));
    double std_error = std_dev / std::sqrt(num_pricing_paths);
    double margin = 1.96 * std_error;
    
    auto end_time = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double> elapsed = end_time - start_time;
    
    PricingResult result;
    result.price = price;
    result.ci_lower = price - margin;
    result.ci_upper = price + margin;
    result.std_error = std_error;
    result.time_taken = elapsed.count();
    
    return result;
}

std::vector<PricingResult> price_multi_asset(
    const std::vector<OptionParams>& params_list
) {
    std::vector<PricingResult> results(params_list.size());
    
    #pragma omp parallel for
    for (size_t i = 0; i < params_list.size(); ++i) {
        const auto& params = params_list[i];
        
        if (params.option_style == "european") {
            results[i] = price_european_option(
                params.option_type,
                params.S0,
                params.K,
                params.T,
                params.r,
                params.sigma,
                params.num_paths
            );
        } else if (params.option_style == "asian") {
            results[i] = price_asian_option(
                params.option_type,
                params.S0,
                params.K,
                params.T,
                params.r,
                params.sigma,
                params.num_paths,
                params.num_steps
            );
        } else if (params.option_style == "american") {
            results[i] = price_american_option(
                params.option_type,
                params.S0,
                params.K,
                params.T,
                params.r,
                params.sigma,
                params.num_paths,
                params.num_steps
            );
        }
    }
    
    return results;
}
