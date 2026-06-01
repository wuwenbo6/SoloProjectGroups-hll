#ifndef OPTION_PRICING_H
#define OPTION_PRICING_H

#include <vector>
#include <string>
#include <utility>

struct OptionParams {
    std::string option_type;
    std::string option_style;
    double S0;
    double K;
    double T;
    double r;
    double sigma;
    int num_paths;
    int num_steps;
};

struct PricingResult {
    double price;
    double ci_lower;
    double ci_upper;
    double std_error;
    double time_taken;
};

PricingResult price_european_option(
    const std::string& option_type,
    double S0,
    double K,
    double T,
    double r,
    double sigma,
    int num_paths
);

PricingResult price_asian_option(
    const std::string& option_type,
    double S0,
    double K,
    double T,
    double r,
    double sigma,
    int num_paths,
    int num_steps
);

PricingResult price_american_option(
    const std::string& option_type,
    double S0,
    double K,
    double T,
    double r,
    double sigma,
    int num_paths,
    int num_steps
);

std::vector<PricingResult> price_multi_asset(
    const std::vector<OptionParams>& params_list
);

#endif
