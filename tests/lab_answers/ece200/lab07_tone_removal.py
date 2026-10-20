"""SPOILERS: worked answers, used only by tests/test_labs.py to prove the checker
passes a correct, hand-written solution. Try the lab yourself first."""
import numpy as np

from scipy.signal import lfilter


def averager(L):
    return np.ones(L) / L


def dirichlet(w, L):
    return np.sin(w * L / 2) / (L * np.sin(w / 2)) * np.exp(-1j * w * (L - 1) / 2)


def remove_tones(x, fs, tone_freqs):
    y = x
    for f in tone_freqs:
        w0 = 2 * np.pi * f / fs
        y = lfilter([1, -2 * np.cos(w0), 1], 1, y)
    return y
