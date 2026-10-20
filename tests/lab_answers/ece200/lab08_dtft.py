"""SPOILERS: worked answers, used only by tests/test_labs.py to prove the checker
passes a correct, hand-written solution. Try the lab yourself first."""
import numpy as np


def dtft(x, w, n_start=0):
    n = np.arange(len(x)) + n_start
    X = np.zeros(len(w), dtype=complex)
    for i in range(len(w)):
        X[i] = np.sum(x * np.exp(-1j * w[i] * n))
    return X


def boxcar_dtft(L, w):
    return np.sin(w * L / 2) / np.sin(w / 2) * np.exp(-1j * w * (L - 1) / 2)


def delayed_dtft(X, w, d):
    return X * np.exp(-1j * w * d)


def modulate(x, w0):
    return x * np.exp(1j * w0 * np.arange(len(x)))


def ideal_lowpass(wc, n):
    return wc / np.pi * np.sinc(wc * n / np.pi)
