%module shallow_water

%{
#define SWIG_FILE_WITH_INIT
#include "shallow_water_solver.h"
#include "netcdf_io.h"
%}

%include "std_vector.i"
%include "std_string.i"
%include "cpointer.i"

namespace std {
    %template(DoubleVector) vector<double>;
}

%pointer_class(int, intp);

%include "numpy.i"

%init %{
import_array();
%}

%apply (double* IN_ARRAY1, int DIM1) {
    (const std::vector<double>& h)
}

%rename (ShallowWaterSolver) ShallowWaterSolver;
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
    
    %newobject get_h_np;
    %newobject get_u_np;
    %newobject get_v_np;
    
    %extend {
        PyObject* get_h_np() const {
            npy_intp dims[2] = {self->ny(), self->nx()};
            PyObject* arr = PyArray_SimpleNew(2, dims, NPY_DOUBLE);
            if (!arr) return NULL;
            double* data = static_cast<double*>(PyArray_DATA((PyArrayObject*)arr));
            const std::vector<double>& src = self->get_h();
            std::copy(src.begin(), src.end(), data);
            return arr;
        }
        
        PyObject* get_u_np() const {
            npy_intp dims[2] = {self->ny(), self->nx()};
            PyObject* arr = PyArray_SimpleNew(2, dims, NPY_DOUBLE);
            if (!arr) return NULL;
            double* data = static_cast<double*>(PyArray_DATA((PyArrayObject*)arr));
            const std::vector<double>& src = self->get_u();
            std::copy(src.begin(), src.end(), data);
            return arr;
        }
        
        PyObject* get_v_np() const {
            npy_intp dims[2] = {self->ny(), self->nx()};
            PyObject* arr = PyArray_SimpleNew(2, dims, NPY_DOUBLE);
            if (!arr) return NULL;
            double* data = static_cast<double*>(PyArray_DATA((PyArrayObject*)arr));
            const std::vector<double>& src = self->get_v();
            std::copy(src.begin(), src.end(), data);
            return arr;
        }
        
        void set_h_np(PyObject* arr) {
            PyArrayObject* np_arr = reinterpret_cast<PyArrayObject*>(arr);
            if (PyArray_TYPE(np_arr) != NPY_DOUBLE) {
                PyErr_SetString(PyExc_TypeError, "Expected double array");
                return;
            }
            double* data = static_cast<double*>(PyArray_DATA(np_arr));
            int size = self->nx() * self->ny();
            std::vector<double> vec(data, data + size);
            self->set_h(vec);
        }
        
        void set_u_np(PyObject* arr) {
            PyArrayObject* np_arr = reinterpret_cast<PyArrayObject*>(arr);
            if (PyArray_TYPE(np_arr) != NPY_DOUBLE) {
                PyErr_SetString(PyExc_TypeError, "Expected double array");
                return;
            }
            double* data = static_cast<double*>(PyArray_DATA(np_arr));
            int size = self->nx() * self->ny();
            std::vector<double> vec(data, data + size);
            self->set_u(vec);
        }
        
        void set_v_np(PyObject* arr) {
            PyArrayObject* np_arr = reinterpret_cast<PyArrayObject*>(arr);
            if (PyArray_TYPE(np_arr) != NPY_DOUBLE) {
                PyErr_SetString(PyExc_TypeError, "Expected double array");
                return;
            }
            double* data = static_cast<double*>(PyArray_DATA(np_arr));
            int size = self->nx() * self->ny();
            std::vector<double> vec(data, data + size);
            self->set_v(vec);
        }
    }
    
    int nx() const;
    int ny() const;
    double dx() const;
    double dy() const;
    double dt() const;
    int current_step() const;
};

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
    
    %extend {
        static PyObject* read_field_np(const std::string& filename,
                                        const std::string& var_name) {
            std::vector<double> data;
            int nx, ny;
            bool success = NetCDFIO::read_field(filename, var_name, data, nx, ny);
            if (!success) {
                PyErr_SetString(PyExc_RuntimeError, "Failed to read NetCDF file");
                return NULL;
            }
            npy_intp dims[2] = {ny, nx};
            PyObject* arr = PyArray_SimpleNew(2, dims, NPY_DOUBLE);
            if (!arr) return NULL;
            double* arr_data = static_cast<double*>(PyArray_DATA((PyArrayObject*)arr));
            std::copy(data.begin(), data.end(), arr_data);
            return arr;
        }
    }
};

#ifdef USE_MPI
%include "shallow_water_mpi.h"

%extend ShallowWaterSolverMPI {
    PyObject* gather_global_h_np() const {
        std::vector<double> data = self->gather_global_h();
        if (data.empty()) {
            Py_RETURN_NONE;
        }
        npy_intp dims[2] = {self->global_ny(), self->global_nx()};
        PyObject* arr = PyArray_SimpleNew(2, dims, NPY_DOUBLE);
        if (!arr) return NULL;
        double* arr_data = static_cast<double*>(PyArray_DATA((PyArrayObject*)arr));
        std::copy(data.begin(), data.end(), arr_data);
        return arr;
    }
    
    PyObject* gather_global_u_np() const {
        std::vector<double> data = self->gather_global_u();
        if (data.empty()) {
            Py_RETURN_NONE;
        }
        npy_intp dims[2] = {self->global_ny(), self->global_nx()};
        PyObject* arr = PyArray_SimpleNew(2, dims, NPY_DOUBLE);
        if (!arr) return NULL;
        double* arr_data = static_cast<double*>(PyArray_DATA((PyArrayObject*)arr));
        std::copy(data.begin(), data.end(), arr_data);
        return arr;
    }
    
    PyObject* gather_global_v_np() const {
        std::vector<double> data = self->gather_global_v();
        if (data.empty()) {
            Py_RETURN_NONE;
        }
        npy_intp dims[2] = {self->global_ny(), self->global_nx()};
        PyObject* arr = PyArray_SimpleNew(2, dims, NPY_DOUBLE);
        if (!arr) return NULL;
        double* arr_data = static_cast<double*>(PyArray_DATA((PyArrayObject*)arr));
        std::copy(data.begin(), data.end(), arr_data);
        return arr;
    }
    
    static void init() {
        ShallowWaterSolverMPI::init(NULL, NULL);
    }
}
#endif
