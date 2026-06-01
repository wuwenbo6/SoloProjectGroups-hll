lines = open("main.go").readlines()
fieldspecs = """var FieldSpecs = map[int]FieldSpec{
2:  {2, "PAN", FTLLVAR, 19, "bcd"},
3:  {3, "Processing Code", FTFixed, 6, "bcd"},
4:  {4, "Amount", FTFixed, 12, "bcd"},
7:  {7, "Transmission DateTime", FTFixed, 10, "bcd"},
11: {11, "STAN", FTFixed, 6, "bcd"},
12: {12, "Time Local", FTFixed, 6, "bcd"},
13: {13, "Date Local", FTFixed, 4, "bcd"},
14: {14, "Expiry Date", FTFixed, 4, "bcd"},
18: {18, "Merchant Type", FTFixed, 4, "bcd"},
22: {22, "POS Entry Mode", FTFixed, 3, "bcd"},
23: {23, "Card Seq", FTFixed, 3, "bcd"},
25: {25, "POS Condition", FTFixed, 2, "bcd"},
32: {32, "Acquirer ID", FTLLVAR, 11, "bcd"},
37: {37, "RRN", FTFixed, 12, "ascii"},
38: {38, "Auth Code", FTFixed, 6, "ascii"},
39: {39, "Response Code", FTFixed, 2, "ascii"},
41: {41, "Terminal ID", FTFixed, 8, "ascii"},
42: {42, "Merchant ID", FTFixed, 15, "ascii"},
43: {43, "Merchant Name", FTFixed, 40, "ascii"},
49: {49, "Currency Code", FTFixed, 3, "bcd"},
}
"""
insert_pos = 28
final_lines = lines[:insert_pos+1] + [fieldspecs] + lines[insert_pos+1:]
open("main.go", "w").writelines(final_lines)
print("added fieldspecs")
