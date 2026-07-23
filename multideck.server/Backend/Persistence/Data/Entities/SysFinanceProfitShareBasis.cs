using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceProfitShareBasis
{
    public string FinpsbCode { get; set; } = null!;

    public string FinpsbName { get; set; } = null!;

    public string? FinpsbDescription { get; set; }

    public int FinpsbSortOrder { get; set; }

    public bool FinpsbIsActive { get; set; }

    public virtual ICollection<FinProfitShareAgreement> FinProfitShareAgreements { get; set; } = new List<FinProfitShareAgreement>();
}
