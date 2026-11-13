// Sets the file of one site, day (or month) and record type:
// <out>/EU_OEE_Fact/site=<Site>/EU_OEE_Fact_<day>_<tag>_<source>.parquet,
// tag plan, tu, loss or rr. In: the parquet node output. Out: msg.path.
// A rerun of the day replaces only this record type of this source.
msg.path = msg.out + '/EU_OEE_Fact/site=' + msg.site;
msg.path += '/EU_OEE_Fact_' + msg.month + '_' + msg.fileTag;
msg.path += '_' + msg.source + '.parquet';
msg.filename = msg.path.split('/').pop();
return msg;
