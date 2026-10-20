"""SPOILERS: worked answers, used only by tests/test_labs.py to prove the checker
passes a correct, hand-written solution. Try the lab yourself first."""
import numpy as np


def make_cosine(A, f, phi, t):
    return A * np.cos(2 * np.pi * f * t + phi)


def phasor(A, phi):
    return A * np.exp(1j * phi)


def add_phasors(amps, phases):
    total = 0
    for A, phi in zip(amps, phases):
        total = total + phasor(A, phi)
    return abs(total), np.angle(total)


def sum_of_cosines(amps, phases, f, t):
    total = np.zeros(len(t))
    for A, phi in zip(amps, phases):
        total = total + make_cosine(A, f, phi, t)
    return total
