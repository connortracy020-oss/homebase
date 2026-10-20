"""ECE 200 Lab 5: convolution and LTI systems

Background: DSP First Lab P-9 (sampling, convolution and FIR filtering), linked
on the week 5 page. It uses MATLAB; this lab does the core ideas in Python.

How to work:
  1. Fill in each function marked TODO. Replace `return None` with your code.
  2. Check:   .venv\\Scripts\\python labs\\check.py 5
  3. Try it:  .venv\\Scripts\\python data\\labs\\lab05_convolution.py
my_conv must not call np.convolve or scipy: the checker uses those to check you.
"""
import numpy as np


# %% TODO 1: convolution by flip-and-slide
def my_conv(x, h):
    """Return the full convolution y = x * h, of length len(x) + len(h) - 1:
        y[n] = sum_k h[k] x[n - k]
    (x[n - k] is 0 outside 0 .. len(x) - 1).

    Hint: y = np.zeros(len(x) + len(h) - 1); loop over n and k, and only add
    when 0 <= n - k < len(x).
    """
    return None  # TODO


# %% TODO 2: two filters in a row
def cascade(h1, h2):
    """Return the ONE impulse response equal to filtering by h1, then by h2.
    (Use your my_conv.)"""
    return None  # TODO


# %% TODO 3: a delay
def delay(x, d):
    """Return x delayed by d samples, same length as x: d zeros, then x with
    its last d values dropped.  delay([1, 2, 3, 4, 5], 2) -> [0, 0, 1, 2, 3]
    """
    return None  # TODO


# %% TODO 4: test a system for linearity
def is_linear(system):
    """Return True if `system` seems linear, False if not.

    `system` is a function: give it an array x, it returns an array y.
    Test superposition: pick random x1, x2 (np.random.randn(20)) and numbers a, b.
    Linear means  system(a*x1 + b*x2)  equals  a*system(x1) + b*system(x2).
    Compare arrays with np.allclose(...).
    """
    return None  # TODO


# %% TODO 5: test a system for time invariance
def is_time_invariant(system):
    """Return True if delaying the input just delays the output.

    Pick a random x and a delay d (say 3). Compare
        system(delay(x, d))   with   delay(system(x), d)
    but only from index d onward (the first d values depend on the zeros
    we filled in): use [d:] on both before np.allclose.
    """
    return None  # TODO


# %% Try it
if __name__ == "__main__":
    x, h = np.array([1.0, 2, 3]), np.array([1.0, -1])
    print("my_conv:", my_conv(x, h), "  np.convolve:", np.convolve(x, h))
    print("x^2 linear?", is_linear(lambda v: v ** 2))
    print("x[n] + x[n-1] time-invariant?", is_time_invariant(lambda v: v + delay(v, 1)))
