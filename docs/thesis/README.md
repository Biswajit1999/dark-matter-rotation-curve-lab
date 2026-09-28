# Dark Matter Evidence Lab research monograph

This directory contains the LaTeX source for the publication-length technical report accompanying the interactive project.

The document is explicitly labelled **Research Report / Technical Monograph**. It is not presented as an institutional thesis and does not claim a dark-matter discovery.

## Build locally

With a TeX installation containing Biber and latexmk:

    latexmk -pdf -interaction=nonstopmode -halt-on-error main.tex

The GitHub document workflow compiles the PDF and uploads it as a workflow artifact.

## Scope

The report distinguishes literature review, reproduced public-data analysis, original software/visualisation work, independent numerical validation, conditional futures calculations, limitations and open problems.
