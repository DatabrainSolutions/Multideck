// iCustoms Arrival Transport Type, DE 7/9 (Box 18), verified against its import form.
export const customsArrivalTransportTypes = [
  ["10", "International Maritime Organization (IMO) ship identification number"],
  ["11", "Name of the sea-going vessel"],
  ["20", "Wagon number"],
  ["30", "Registration number of the road vehicle"],
  ["40", "IATA flight number"],
  ["41", "Registration number of the aircraft"],
  ["80", "European Vessel Identification Number (ENI code)"],
  ["81", "Name of the inland waterways vessel"],
] as const
