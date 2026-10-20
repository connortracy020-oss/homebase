"""SPOILERS: worked answers, used only by tests/test_labs.py to prove the checker
passes a correct, hand-written solution. Try the lab yourself first."""
import numpy as np


def dtfs_coeffs(x):
    N = len(x)
    n = np.arange(N)
    a = np.zeros(N, dtype=complex)
    for k in range(N):
        a[k] = np.sum(x * np.exp(-2j * np.pi * k * n / N)) / N
    return a


def dtfs_synthesize(a):
    N = len(a)
    k = np.arange(N)
    x = np.zeros(N, dtype=complex)
    for n in range(N):
        x[n] = np.sum(a * np.exp(2j * np.pi * k * n / N))
    return x


def average_power(a):
    return np.sum(np.abs(a) ** 2)
