from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import sys
import unittest


test_directory = Path(__file__).resolve().parent
sys.path.insert(0, str(test_directory))
loader = unittest.TestLoader()
suite = unittest.TestSuite()

for test_path in sorted(test_directory.glob("test_*.test.py")):
    module_name = test_path.name[:-3].replace(".", "_")
    spec = spec_from_file_location(module_name, test_path)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    suite.addTests(loader.loadTestsFromModule(module))

result = unittest.TextTestRunner(verbosity=2).run(suite)
raise SystemExit(not result.wasSuccessful())
