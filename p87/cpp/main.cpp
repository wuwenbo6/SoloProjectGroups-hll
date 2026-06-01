#include "option_pricing.h"
#include <iostream>
#include <sstream>
#include <string>

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <option_style> <option_type> <S0> <K> <T> <r> <sigma> <num_paths> [num_steps]" << std::endl;
        return 1;
    }

    std::string option_style = argv[1];
    std::string option_type = argv[2];
    double S0 = std::stod(argv[3]);
    double K = std::stod(argv[4]);
    double T = std::stod(argv[5]);
    double r = std::stod(argv[6]);
    double sigma = std::stod(argv[7]);
    int num_paths = std::stoi(argv[8]);
    int num_steps = (argc > 9) ? std::stoi(argv[9]) : 252;

    PricingResult result;

    if (option_style == "european") {
        result = price_european_option(option_type, S0, K, T, r, sigma, num_paths);
    } else if (option_style == "asian") {
        result = price_asian_option(option_type, S0, K, T, r, sigma, num_paths, num_steps);
    } else if (option_style == "american") {
        result = price_american_option(option_type, S0, K, T, r, sigma, num_paths, num_steps);
    } else {
        std::cerr << "Unknown option style: " << option_style << std::endl;
        return 1;
    }

    std::cout << result.price << " " << result.ci_lower << " " << result.ci_upper << " " 
              << result.std_error << " " << result.time_taken << std::endl;

    return 0;
}
