"""SPOILERS: worked answers, used only by tests/test_labs.py to prove the checker
passes a correct, hand-written solution. Try the lab yourself first."""
import numpy as np


def impulse(n_samples):
    x = np.zeros(n_samples)
    x[0] = 1
    return x


def unit_step(n_samples):
    return np.ones(n_samples)


def my_fir(x, b):
    y = np.zeros(len(x))
    for n in range(len(x)):
        for k in range(len(b)):
            if n - k >= 0:
                y[n] += b[k] * x[n - k]
    return y


def running_average(L):
    return np.ones(L) / L


def first_difference():
    return np.array([1.0, -1.0])
