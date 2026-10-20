"""ECE 200 Lab 9: discrete-time Fourier series

Background: DSP First Lab P-14 (octave band filtering), linked on the week 9 page.
It uses MATLAB; this lab works with the DT Fourier series in Python.

How to work:
  1. Fill in each function marked TODO. Replace `return None` with your code.
  2. Check:   .venv\\Scripts\\python labs\\check.py 9
  3. Plot:    .venv\\Scripts\\python data\\labs\\lab09_dtfs.py
Don't call np.fft in these functions: the checker uses it to check you.
"""
import numpy as np


# %% TODO 1: analysis (signal -> coefficients)
def dtfs_coeffs(x):
    """x is ONE period (N samples) of a periodic signal. Return a_k for k = 0 .. N-1:
        a_k = (1/N) sum_n x[n] e^(-j 2 pi k n / N)
    Hint: a = np.zeros(N, dtype=complex); loop over k, and use n = np.arange(N).
    """
    return None  # TODO


# %% TODO 2: synthesis (coefficients -> signal)
def dtfs_synthesize(a):
    """Return one period of x[n] = sum_k a_k e^(+j 2 pi k n / N), n = 0 .. N-1."""
    return None  # TODO


# %% TODO 3: Parseval
def average_power(a):
    """Return the average power from the coefficients: sum_k |a_k|^2.
    (It equals the mean of |x[n]|^2 over one period.)"""
    return None  # TODO


# %% Try it: a square wave's coefficients
if __name__ == "__main__":
    import matplotlib.pyplot as plt

    x = np.array([1.0] * 5 + [0.0] * 5)
    a = dtfs_coeffs(x)
    print("power from a_k:", average_power(a), "  mean of x^2:", np.mean(x ** 2))
    plt.stem(np.arange(len(a)), np.abs(a))
    plt.xlabel("k")
    plt.ylabel("|a_k|")
    plt.show()
