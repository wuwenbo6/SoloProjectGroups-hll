#ifndef NETCDF_IO_H
#define NETCDF_IO_H

#include <vector>
#include <string>

class NetCDFIO {
public:
    static bool write_field(const std::string& filename,
                            const std::vector<double>& data,
                            int nx, int ny,
                            const std::string& var_name,
                            const std::vector<double>& x,
                            const std::vector<double>& y);
    
    static bool write_simulation(const std::string& filename,
                                  const std::vector<double>& h,
                                  const std::vector<double>& u,
                                  const std::vector<double>& v,
                                  int nx, int ny, double dx, double dy,
                                  int step, double time);
    
    static bool read_field(const std::string& filename,
                           const std::string& var_name,
                           std::vector<double>& data,
                           int& nx, int& ny);
};

#endif
