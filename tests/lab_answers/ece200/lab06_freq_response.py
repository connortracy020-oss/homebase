"""SPOILERS: worked answers, used only by tests/test_labs.py to prove the checker
passes a correct, hand-written solution. Try the lab yourself first."""
import numpy as np


def freq_response(b, w):
    H = np.zeros(len(w), dtype=complex)
    for k in range(len(b)):
        H += b[k] * np.exp(-1j * w * k)
    return H


def nulling_filter(w0):
    return np.array([1, -2 * np.cos(w0), 1])


def steady_state_output(b, A, w0, phi, n):
    H = freq_response(b, np.array([w0]))[0]
    return abs(H) * A * np.cos(w0 * n + phi + np.angle(H))


def bandpass_filter(L, wc):
    n = np.arange(L)
    return 2 / L * np.cos(wc * n)
