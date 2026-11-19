# Reckitt EU OEE reporting

The OEE data of Reckitt's EU sites, gathered from several sources into report tables that Tableau reads.

## Language

**SIH**:
Siemens Insights Hub, the platform that holds the OEE assets, their KPIs, stops and operator entries.
_Avoid_: MindSphere, Insights Hub (in prose), IH

**EU_OEE_Fact**:
The one live report table Tableau reads: Plan, Loss, Time Utilisation and Run Rate rows of every EU site in 65 columns.
_Avoid_: the fact

**Record type**:
The kind of row in EU_OEE_Fact: Plan, Loss, Time Utilisation or Run Rate.

**Source**:
Where the rows of a line come from: Provideam, SIH or an Excel workbook (Chartres).
_Avoid_: data source (when meaning the system)

**Manual input**:
One OEE entry per production period on a manual SIH asset: order, product, part counts and downtime with reasons, entered by an operator.
_Avoid_: manual entry, manual OEE

**Variable**:
A time-series value on an aspect of an automatic SIH asset (counter, status, product) from which SIH computes KPIs and stops itself.
_Avoid_: tag, signal
