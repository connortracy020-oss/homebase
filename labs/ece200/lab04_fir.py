"""ECE 200 Lab 4: FIR filters by hand

Background: DSP First Lab S-4 (convolution and FIR filters), linked on the
week 4 page. It uses MATLAB; this lab does the core ideas in Python.

How to work:
  1. Fill in each function marked TODO. Replace `return None` with your code.
  2. Check:   .venv\\Scripts\\python labs\\check.py 4
  3. Plot:    .venv\\Scripts\\python data\\labs\\lab04_fir.py
The checker compares my_fir with np.convolve and scipy.signal.lfilter, so
my_fir itself must NOT call those: write the loop yourself.
"""
import numpy as np


# %% TODO 1: test signals
def impulse(n_samples):
    """Return delta[n]: 1 at n = 0, then zeros. Length n_samples."""
    return None  # TODO


def unit_step(n_samples):
    """Return u[n]: all ones. Length n_samples."""
    return None  # TODO


# %% TODO 2: the FIR filter, as a loop
def my_fir(x, b):
    """Return y with the same length as x, where
        y[n] = sum_k b[k] x[n - k]     (k = 0 .. len(b) - 1)
    and x[n - k] counts as 0 when n - k < 0.

    Hint: y = np.zeros(len(x)); then two loops, over n and over k.
    """
    return None  # TODO


# %% TODO 3: two filters to try
def running_average(L):
    """Return the coefficients of an L-point running average: L values of 1/L."""
    return None  # TODO


def first_difference():
    """Return the coefficients of y[n] = x[n] - x[n-1]."""
    return None  # TODO


# %% Try it: impulse and step responses
if __name__ == "__main__":
    import matplotlib.pyplot as plt

    fig, axes = plt.subplots(2, 2)
    for col, (name, b) in enumerate([("5-point average", running_average(5)),
                                     ("first difference", first_difference())]):
        axes[0, col].stem(my_fir(impulse(12), b))
        axes[0, col].set_title(f"{name}: impulse response")
        axes[1, col].stem(my_fir(unit_step(12), b))
        axes[1, col].set_title("step response")
    plt.tight_layout()
    plt.show()
