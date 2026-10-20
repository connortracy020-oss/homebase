"""SPOILERS: worked answers, used only by tests/test_labs.py to prove the checker
passes a correct, hand-written solution. Try the lab yourself first."""
import numpy as np


def sample_cosine(f, fs, n_samples, phi=0.0):
    n = np.arange(n_samples)
    return np.cos(2 * np.pi * f * n / fs + phi)


def alias_frequency(f, fs):
    return abs(f - round(f / fs) * fs)


def fft_peak_frequency(x, fs):
    N = len(x)
    X = np.abs(np.fft.fft(x))[: N // 2 + 1]
    return np.argmax(X) * fs / N


def sinc_reconstruct(x, fs, t):
    n = np.arange(len(x))
    out = np.zeros(len(t))
    for i in range(len(t)):
        out[i] = np.sum(x * np.sinc(fs * t[i] - n))
    return out
