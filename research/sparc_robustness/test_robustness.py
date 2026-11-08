import math
import unittest
from robustness import signed_square,baryonic_v2,halo_v2,inclination_sensitivity

class HaloTests(unittest.TestCase):
    def test_signed_gas(self):
        self.assertEqual(baryonic_v2(-10,20,0,.5,0),100)
    def test_halo_residual(self):
        self.assertEqual(halo_v2(20,10,10,0,1,0),200)
    def test_negative_halo(self):
        self.assertLess(halo_v2(5,10,0,0),0)
    def test_inclination(self):
        v,s=inclination_sensitivity(100,30,2,0)
        self.assertAlmostEqual(v,200)
        self.assertAlmostEqual(s,4)
    def test_low_inclination(self):
        self.assertGreater(inclination_sensitivity(100,15,2,2)[1],inclination_sensitivity(100,75,2,2)[1])
    def test_invalid(self):
        with self.assertRaises(ValueError): inclination_sensitivity(100,0,1,1)

if __name__=='__main__': unittest.main()
