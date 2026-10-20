"""ECE 200 Lab 7: averaging and nulling filters on sampled signals

Background: DSP First Mini-Project 03 (tone removal), linked on the week 7 page.
It uses MATLAB and a sound file; this lab builds its own test signal in Python.

How to work:
  1. Fill in each function marked TODO. Replace `return None` with your code.
  2. Check:   .venv\\Scripts\\python labs\\check.py 7
  3. Plot:    .venv\\Scripts\\python data\\labs\\lab07_tone_removal.py
Here you MAY use np.convolve or scipy.signal.lfilter to do the filtering.
"""
import numpy as np


# %% TODO 1: the averager
def averager(L):
    """Return the coefficients of an L-point averager: L values of 1/L."""
    return None  # TODO


# %% TODO 2: its frequency response in closed form
def dirichlet(w, L):
    """Return the averager's H(e^jw) from the formula (no sum):
        H = sin(w L / 2) / (L sin(w / 2)) * e^(-j w (L - 1) / 2)
    w is an array of frequencies (never exactly 0 in the checks).
    """
    return None  # TODO


# %% TODO 3: remove tones from a recording
def remove_tones(x, fs, tone_freqs):
    """Return x with every tone in tone_freqs (Hz) removed. Same length as x.

    For each tone: w0 = 2 pi f / fs, nulling filter b = [1, -2 cos(w0), 1].
    Filter x by each one in turn. For example:
        from scipy.signal import lfilter
        y = lfilter(b, 1, y)
    (np.convolve(y, b)[:len(y)] does the same.)
    """
    return None  # TODO


# %% Try it: remove 440 Hz and 1000 Hz, keep 2500 Hz
if __name__ == "__main__":
    import matplotlib.pyplot as plt

    fs = 8000
    n = np.arange(fs)
    x = np.cos(2 * np.pi * 440 * n / fs) + np.cos(2 * np.pi * 1000 * n / fs) + np.cos(2 * np.pi * 2500 * n / fs)
    y = remove_tones(x, fs, [440, 1000])
    f = np.arange(fs)  # one second of samples, so FFT bin k is k Hz
    plt.plot(f[: fs // 2], np.abs(np.fft.fft(x))[: fs // 2], label="before")
    plt.plot(f[: fs // 2], np.abs(np.fft.fft(y))[: fs // 2], label="after")
    plt.xlabel("f (Hz)")
    plt.legend()
    plt.show()
