"""SPOILERS: worked answers, used only by tests/test_labs.py to prove the checker
passes a correct, hand-written solution. Try the lab yourself first."""
import numpy as np


def synthesize(amps, freqs, phases, t):
    x = np.zeros(len(t))
    for A, f, phi in zip(amps, freqs, phases):
        x = x + A * np.cos(2 * np.pi * f * t + phi)
    return x


def two_sided_spectrum(amps, freqs, phases):
    spectrum = {}
    for A, f, phi in zip(amps, freqs, phases):
        spectrum[f] = A / 2 * np.exp(1j * phi)
        spectrum[-f] = A / 2 * np.exp(-1j * phi)
    return spectrum


def line_amplitude(x, fs, f):
    N = len(x)
    X = np.fft.fft(x)
    return abs(X[round(f * N / fs)]) / N
