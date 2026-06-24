using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class Warehouse
{
    public Guid WhId { get; set; }

    public string? WhName { get; set; }

    public string? WhOrganisation { get; set; }

    public string? WhAddress1 { get; set; }

    public string? WhAddress2 { get; set; }

    public string? WhTownCity { get; set; }

    public string? WhCountyState { get; set; }

    public string? WhPostZipCode { get; set; }

    public string? WhCountry { get; set; }

    public string? WhUnlocode { get; set; }

    public string? WhMainEmail { get; set; }

    public string? WhMainPhone { get; set; }
}
