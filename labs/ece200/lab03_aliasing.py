"""ECE 200 Lab 3: sampling and aliasing

Background: DSP First Lab S-8 (spectrograms, harmonic lines and chirp aliasing),
linked on the week 3 page. It uses MATLAB; this lab does the core ideas in Python.

How to work:
  1. Fill in each function marked TODO. Replace `return None` with your code.
  2. Check:   .venv\\Scripts\\python labs\\check.py 3
  3. Plot:    .venv\\Scripts\\python data\\labs\\lab03_aliasing.py
"""
import numpy as np


# %% TODO 1: sample a cosine
def sample_cosine(f, fs, n_samples, phi=0.0):
    """Return x[n] = cos(2 pi f n / fs + phi) for n = 0, 1, ..., n_samples - 1.

    Hint: n = np.arange(n_samples)
    """
    return None  # TODO


# %% TODO 2: predict the alias
def alias_frequency(f, fs):
    """Return the frequency (between 0 and fs/2) that a cosine at f Hz looks like
    after sampling at fs.

    Rule: subtract the nearest whole multiple of fs, then drop the sign:
        f_alias = |f - k fs|  with  k = round(f / fs)
    """
    return None  # TODO


# %% TODO 3: find it with the FFT
def fft_peak_frequency(x, fs):
    """Return the frequency in Hz of the biggest FFT line between 0 and fs/2.

    Steps: X = np.abs(np.fft.fft(x)); keep X[0 : N//2 + 1]; k = np.argmax(...);
    bin k is at k * fs / N Hz.
    """
    return None  # TODO


# %% TODO 4: rebuild the continuous signal
def sinc_reconstruct(x, fs, t):
    """Return the ideal D-to-C output at each time in t:
        x(t) = sum_n x[n] sinc(fs t - n)
    np.sinc(u) is sin(pi u) / (pi u), which is the sinc you need.
    Hint: loop over the times in t; for each one, sum over n = np.arange(len(x)).
    """
    return None  # TODO


# %% Try it: a 700 Hz cosine sampled at 1000 Hz
if __name__ == "__main__":
    import matplotlib.pyplot as plt

    fs, f = 1000, 700
    x = sample_cosine(f, fs, 1000)
    print("predicted alias:", alias_frequency(f, fs), "Hz;  FFT peak:", fft_peak_frequency(x, fs), "Hz")
    t = np.linspace(0, 0.02, 500)
    plt.plot(t, np.cos(2 * np.pi * f * t), label=f"{f} Hz original")
    plt.plot(t, sinc_reconstruct(x, fs, t), label="rebuilt from the samples")
    plt.plot(np.arange(21) / fs, x[:21], "o", label="samples")
    plt.legend()
    plt.show()
