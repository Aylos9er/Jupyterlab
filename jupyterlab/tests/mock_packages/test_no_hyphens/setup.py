from os import path
from setuptools import setup
from jupyter_packaging import get_data_files, npm_builder, wrap_installers

version = "3.0.2"
name = "test_no_hyphens"
module_name = "test_no_hyphens"
lab_ext_name = "test_no_hyphens"

HERE = path.abspath(path.dirname(__file__))
lab_path = path.join(HERE, module_name, "labextension")

post_develop = npm_builder(
    build_cmd="build:labextension", build_dir=lab_path, npm="jlpm"
)

data_files_spec = [("share/jupyter/labextensions/" + lab_ext_name, lab_path, "**")]

cmdclass = wrap_installers(post_develop=post_develop)

setup(
    name=name,
    version=version,
    packages=[module_name],
    cmdclass=cmdclass,
    data_files=get_data_files(data_files_spec),
)
