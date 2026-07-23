using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCurrencySetting
{
    public Guid FincurSetId { get; set; }

    public string FincurSetCurrencyCode { get; set; } = null!;

    public string FincurSetName { get; set; } = null!;

    public int FincurSetDecimalPlaces { get; set; }

    public string FincurSetRoundingMethodCode { get; set; } = null!;

    public decimal FincurSetToleranceAmount { get; set; }

    public bool FincurSetIsPermittedForQuote { get; set; }

    public bool FincurSetIsPermittedForInvoice { get; set; }

    public bool FincurSetIsActive { get; set; }
}
