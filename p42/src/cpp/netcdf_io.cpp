#include "netcdf_io.h"
#include <netcdf.h>
#include <iostream>
#include <cmath>

#define NC_CHECK(status) \
    if (status != NC_NOERR) { \
        std::cerr << "NetCDF error: " << nc_strerror(status) << std::endl; \
        return false; \
    }

bool NetCDFIO::write_field(const std::string& filename,
                            const std::vector<double>& data,
                            int nx, int ny,
                            const std::string& var_name,
                            const std::vector<double>& x,
                            const std::vector<double>& y) {
    int ncid, x_dimid, y_dimid, varid, x_varid, y_varid;
    int dimids[2];
    
    int status = nc_create(filename.c_str(), NC_CLOBBER, &ncid);
    NC_CHECK(status);
    
    status = nc_def_dim(ncid, "x", nx, &x_dimid);
    NC_CHECK(status);
    status = nc_def_dim(ncid, "y", ny, &y_dimid);
    NC_CHECK(status);
    
    dimids[0] = y_dimid;
    dimids[1] = x_dimid;
    
    status = nc_def_var(ncid, "x", NC_DOUBLE, 1, &x_dimid, &x_varid);
    NC_CHECK(status);
    status = nc_def_var(ncid, "y", NC_DOUBLE, 1, &y_dimid, &y_varid);
    NC_CHECK(status);
    
    status = nc_def_var(ncid, var_name.c_str(), NC_DOUBLE, 2, dimids, &varid);
    NC_CHECK(status);
    
    status = nc_enddef(ncid);
    NC_CHECK(status);
    
    status = nc_put_var_double(ncid, x_varid, x.data());
    NC_CHECK(status);
    status = nc_put_var_double(ncid, y_varid, y.data());
    NC_CHECK(status);
    
    status = nc_put_var_double(ncid, varid, data.data());
    NC_CHECK(status);
    
    status = nc_close(ncid);
    NC_CHECK(status);
    
    return true;
}

bool NetCDFIO::write_simulation(const std::string& filename,
                                  const std::vector<double>& h,
                                  const std::vector<double>& u,
                                  const std::vector<double>& v,
                                  int nx, int ny, double dx, double dy,
                                  int step, double time) {
    int ncid, x_dimid, y_dimid;
    int h_varid, u_varid, v_varid, x_varid, y_varid;
    int dimids[2];
    
    std::vector<double> x(nx), y(ny);
    for (int i = 0; i < nx; ++i) x[i] = i * dx;
    for (int j = 0; j < ny; ++j) y[j] = j * dy;
    
    int status = nc_create(filename.c_str(), NC_CLOBBER, &ncid);
    NC_CHECK(status);
    
    status = nc_def_dim(ncid, "x", nx, &x_dimid);
    NC_CHECK(status);
    status = nc_def_dim(ncid, "y", ny, &y_dimid);
    NC_CHECK(status);
    
    dimids[0] = y_dimid;
    dimids[1] = x_dimid;
    
    status = nc_def_var(ncid, "x", NC_DOUBLE, 1, &x_dimid, &x_varid);
    NC_CHECK(status);
    status = nc_def_var(ncid, "y", NC_DOUBLE, 1, &y_dimid, &y_varid);
    NC_CHECK(status);
    
    status = nc_def_var(ncid, "h", NC_DOUBLE, 2, dimids, &h_varid);
    NC_CHECK(status);
    status = nc_def_var(ncid, "u", NC_DOUBLE, 2, dimids, &u_varid);
    NC_CHECK(status);
    status = nc_def_var(ncid, "v", NC_DOUBLE, 2, dimids, &v_varid);
    NC_CHECK(status);
    
    status = nc_put_att_int(ncid, NC_GLOBAL, "step", NC_INT, 1, &step);
    NC_CHECK(status);
    status = nc_put_att_double(ncid, NC_GLOBAL, "time", NC_DOUBLE, 1, &time);
    NC_CHECK(status);
    
    status = nc_enddef(ncid);
    NC_CHECK(status);
    
    status = nc_put_var_double(ncid, x_varid, x.data());
    NC_CHECK(status);
    status = nc_put_var_double(ncid, y_varid, y.data());
    NC_CHECK(status);
    
    status = nc_put_var_double(ncid, h_varid, h.data());
    NC_CHECK(status);
    status = nc_put_var_double(ncid, u_varid, u.data());
    NC_CHECK(status);
    status = nc_put_var_double(ncid, v_varid, v.data());
    NC_CHECK(status);
    
    status = nc_close(ncid);
    NC_CHECK(status);
    
    return true;
}

bool NetCDFIO::read_field(const std::string& filename,
                           const std::string& var_name,
                           std::vector<double>& data,
                           int& nx, int& ny) {
    int ncid, varid;
    size_t dim_len[2];
    
    int status = nc_open(filename.c_str(), NC_NOWRITE, &ncid);
    NC_CHECK(status);
    
    status = nc_inq_varid(ncid, var_name.c_str(), &varid);
    NC_CHECK(status);
    
    int ndims;
    int dimids[2];
    status = nc_inq_var(ncid, varid, NULL, NULL, &ndims, dimids, NULL);
    NC_CHECK(status);
    
    if (ndims != 2) {
        std::cerr << "Expected 2D variable" << std::endl;
        nc_close(ncid);
        return false;
    }
    
    status = nc_inq_dimlen(ncid, dimids[1], &dim_len[0]);
    NC_CHECK(status);
    status = nc_inq_dimlen(ncid, dimids[0], &dim_len[1]);
    NC_CHECK(status);
    
    nx = static_cast<int>(dim_len[0]);
    ny = static_cast<int>(dim_len[1]);
    
    data.resize(nx * ny);
    
    status = nc_get_var_double(ncid, varid, data.data());
    NC_CHECK(status);
    
    status = nc_close(ncid);
    NC_CHECK(status);
    
    return true;
}
