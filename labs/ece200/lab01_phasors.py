"""ECE 200 Lab 1: sinusoids and phasors

Background: DSP First Lab P-2 (complex exponentials, multipath), the handout
linked on the week 1 page. The handout uses MATLAB; this lab does the same ideas
in Python with NumPy.

How to work:
  1. Fill in each function marked TODO. Replace `return None` with your code.
  2. Check your work from the Homebase folder:
         .venv\\Scripts\\python labs\\check.py 1
  3. Run this file to see the plots:
         .venv\\Scripts\\python data\\labs\\lab01_phasors.py
The `# %%` lines split the file into cells. In VS Code, "Run Cell" runs one at a time.
"""
import numpy as np


# %% TODO 1: one cosine
def make_cosine(A, f, phi, t):
    """Return x(t) = A cos(2 pi f t + phi) at every time in the array t.

    A is the amplitude, f the frequency in Hz, phi the phase in radians,
    t a NumPy array of times in seconds.
    Hint: np.cos and np.pi work on a whole array at once; no loop needed.
    """
    return None  # TODO


# %% TODO 2: a phasor
def phasor(A, phi):
    """Return the phasor (complex amplitude) X = A e^(j phi).

    Python writes j as 1j, so e^(j phi) is np.exp(1j * phi).
    """
    return None  # TODO


# %% TODO 3: add sinusoids with phasors
def add_phasors(amps, phases):
    """Return (A, phi) for the ONE cosine equal to sum_k amps[k] cos(w t + phases[k]).

    All the cosines have the same frequency w. Steps:
      - make each phasor (use your phasor function, or work on whole arrays),
      - add them up,
      - A is the size of the total: abs(total); phi is its angle: np.angle(total).
    Return both, like this:  return A, phi
    """
    return None  # TODO


# %% TODO 4: add them numerically
def sum_of_cosines(amps, phases, f, t):
    """Return sum_k amps[k] cos(2 pi f t + phases[k]), added up sample by sample.

    Hint: start with total = np.zeros(len(t)) and add one cosine per loop.
    """
    return None  # TODO


# %% Try it: three cosines and their phasor sum
if __name__ == "__main__":
    import matplotlib.pyplot as plt

    amps, phases, f = [1.0, 2.0, 1.5], [0.0, np.pi / 2, -2.0], 50.0
    t = np.linspace(0, 0.04, 400)
    A, phi = add_phasors(amps, phases)
    plt.plot(t, sum_of_cosines(amps, phases, f, t), label="numeric sum")
    plt.plot(t, make_cosine(A, f, phi, t), "--", label=f"phasor sum: A={A:.2f}, phi={phi:.2f}")
    plt.xlabel("t (s)")
    plt.legend()
    plt.show()
