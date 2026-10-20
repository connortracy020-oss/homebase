"""ECE 200 Lab 2: spectrum and synthesis

Background: DSP First Lab 04 (synthesis of sinusoidal signals, music synthesis),
linked on the week 2 page. It uses MATLAB; this lab does the core ideas in Python.

How to work:
  1. Fill in each function marked TODO. Replace `return None` with your code.
  2. Check:   .venv\\Scripts\\python labs\\check.py 2
  3. Plot:    .venv\\Scripts\\python data\\labs\\lab02_spectrum.py
"""
import numpy as np


# %% TODO 1: a sum of sinusoids
def synthesize(amps, freqs, phases, t):
    """Return x(t) = sum_k amps[k] cos(2 pi freqs[k] t + phases[k]).

    Hint: zip(amps, freqs, phases) gives you one (A, f, phi) at a time.
    """
    return None  # TODO


# %% TODO 2: the two-sided spectrum
def two_sided_spectrum(amps, freqs, phases):
    """Return the spectrum as a dict {frequency: complex amplitude}.

    Each cosine A cos(2 pi f t + phi) gives TWO lines (Euler's formula):
        at +f:  (A/2) e^(+j phi)
        at -f:  (A/2) e^(-j phi)
    Example: spectrum = {};  spectrum[f] = ...;  spectrum[-f] = ...
    (The frequencies are all different and above zero.)
    """
    return None  # TODO


# %% TODO 3: read a spectrum line off the FFT
def line_amplitude(x, fs, f):
    """Return |X[k]| / N for the FFT bin at frequency f Hz.

    x has N samples taken at fs samples per second. Use X = np.fft.fft(x).
    Bin k is at frequency k * fs / N, so k = round(f * N / fs).
    For a whole number of periods, this equals A/2 for a cosine of amplitude A.
    """
    return None  # TODO


# %% Try it: plot a signal and its spectrum lines
if __name__ == "__main__":
    import matplotlib.pyplot as plt

    amps, freqs, phases = [1.0, 0.6, 0.3], [220.0, 440.0, 660.0], [0.0, -1.0, 2.0]
    fs = 8000
    t = np.arange(0, 1, 1 / fs)
    x = synthesize(amps, freqs, phases, t)
    spec = two_sided_spectrum(amps, freqs, phases)
    fig, (top, bottom) = plt.subplots(2, 1)
    top.plot(t[:400], x[:400])
    top.set_xlabel("t (s)")
    bottom.stem(list(spec), [abs(v) for v in spec.values()])
    bottom.set_xlabel("f (Hz)")
    bottom.set_ylabel("|X|")
    print("FFT says the 440 Hz line is", line_amplitude(x, fs, 440))
    plt.show()
