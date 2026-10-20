"""ECE 200 Lab 8: the DTFT

Background: DSP First Lab S-6 (FIR filter design), linked on the week 8 page.
It uses a MATLAB GUI; this lab computes DTFTs directly in Python.

How to work:
  1. Fill in each function marked TODO. Replace `return None` with your code.
  2. Check:   .venv\\Scripts\\python labs\\check.py 8
  3. Plot:    .venv\\Scripts\\python data\\labs\\lab08_dtft.py
dtft must not call scipy.signal.freqz or np.fft: write the sum.
"""
import numpy as np


# %% TODO 1: the DTFT of a finite sequence
def dtft(x, w, n_start=0):
    """Return X(e^jw) = sum_n x[n] e^(-j w n) at each frequency in the array w.

    x[0] sits at time index n_start (so the indices are n_start, n_start + 1, ...).
    Hint: n = np.arange(len(x)) + n_start; loop over the frequencies in w.
    """
    return None  # TODO


# %% TODO 2: the boxcar in closed form
def boxcar_dtft(L, w):
    """Return the DTFT of L ones (n = 0 .. L-1) from the Dirichlet formula:
        sin(w L / 2) / sin(w / 2) * e^(-j w (L - 1) / 2)
    """
    return None  # TODO


# %% TODO 3: the shift property
def delayed_dtft(X, w, d):
    """X is the DTFT of x[n] at frequencies w. Return the DTFT of x[n - d]:
    X times e^(-j w d)."""
    return None  # TODO


# %% TODO 4: modulation
def modulate(x, w0):
    """Return x[n] e^(j w0 n) for n = 0 .. len(x) - 1.
    (Its DTFT is X shifted right by w0.)"""
    return None  # TODO


# %% TODO 5: the ideal lowpass filter
def ideal_lowpass(wc, n):
    """Return h[n] = sin(wc n) / (pi n), with h[0] = wc / pi, for the integer array n.

    Shortcut: this equals (wc / pi) * np.sinc(wc * n / pi), which handles n = 0 for you.
    """
    return None  # TODO


# %% Try it: a boxcar and a truncated ideal lowpass
if __name__ == "__main__":
    import matplotlib.pyplot as plt

    w = np.linspace(-np.pi, np.pi, 1001)
    plt.plot(w, np.abs(dtft(np.ones(8), w)), label="|DTFT| of 8 ones")
    n = np.arange(-20, 21)
    plt.plot(w, np.abs(dtft(ideal_lowpass(np.pi / 3, n), w, n_start=-20)), label="ideal lowpass, 41 taps")
    plt.xlabel("w (rad/sample)")
    plt.legend()
    plt.show()
