"""SPOILERS: worked answers, used only by tests/test_labs.py to prove the checker
passes a correct, hand-written solution. Try the lab yourself first."""
import numpy as np


def my_conv(x, h):
    y = np.zeros(len(x) + len(h) - 1)
    for n in range(len(y)):
        for k in range(len(h)):
            if 0 <= n - k < len(x):
                y[n] += h[k] * x[n - k]
    return y


def cascade(h1, h2):
    return my_conv(h1, h2)


def delay(x, d):
    return np.concatenate([np.zeros(d), x[: len(x) - d]])


def is_linear(system):
    x1, x2 = np.random.randn(20), np.random.randn(20)
    a, b = 2.0, -0.7
    return np.allclose(system(a * x1 + b * x2), a * system(x1) + b * system(x2))


def is_time_invariant(system):
    x, d = np.random.randn(20), 3
    return np.allclose(system(delay(x, d))[d:], delay(system(x), d)[d:])
