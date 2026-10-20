"""ECE 200 Lab 6: frequency response of FIR filters

Background: DSP First Lab P-12 (frequency response: bandpass and nulling
filters), linked on the week 6 page. It uses MATLAB; this lab does the core
ideas in Python.

How to work:
  1. Fill in each function marked TODO. Replace `return None` with your code.
  2. Check:   .venv\\Scripts\\python labs\\check.py 6
  3. Plot:    .venv\\Scripts\\python data\\labs\\lab06_freq_response.py
freq_response must not call scipy.signal.freqz or np.fft: write the sum.
"""
import numpy as np


# %% TODO 1: H(e^jw) from the coefficients
def freq_response(b, w):
    """Return H(e^jw) = sum_k b[k] e^(-j w k) at every frequency in the array w.

    Hint: H = np.zeros(len(w), dtype=complex); add b[k] * np.exp(-1j * w * k)
    for each k.
    """
    return None  # TODO


# %% TODO 2: a nulling filter
def nulling_filter(w0):
    """Return b = [1, -2 cos(w0), 1]. This filter's H is zero at w = w0,
    so it removes a sinusoid at that frequency."""
    return None  # TODO


# %% TODO 3: sinusoid in, sinusoid out
def steady_state_output(b, A, w0, phi, n):
    """Predict the output when x[n] = A cos(w0 n + phi) goes through filter b:
        y[n] = |H(e^jw0)| A cos(w0 n + phi + angle of H(e^jw0))
    Use your freq_response to get H at w0 (pass np.array([w0])).
    """
    return None  # TODO


# %% TODO 4: a simple bandpass filter
def bandpass_filter(L, wc):
    """Return h[n] = (2 / L) cos(wc n) for n = 0 .. L - 1 (passes frequencies near wc)."""
    return None  # TODO


# %% Try it: magnitude of three filters
if __name__ == "__main__":
    import matplotlib.pyplot as plt

    w = np.linspace(-np.pi, np.pi, 1000)
    for name, b in [("nulling at pi/3", nulling_filter(np.pi / 3)),
                    ("bandpass at 0.4 pi, L=25", bandpass_filter(25, 0.4 * np.pi)),
                    ("3-point average", np.ones(3) / 3)]:
        plt.plot(w, np.abs(freq_response(b, w)), label=name)
    plt.xlabel("w (rad/sample)")
    plt.ylabel("|H|")
    plt.legend()
    plt.show()
