using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinTaxJurisdiction
{
    public Guid FintaxJurId { get; set; }

    public string FintaxJurCode { get; set; } = null!;

    public string FintaxJurName { get; set; } = null!;

    public string FintaxJurCountryCode { get; set; } = null!;

    public string? FintaxJurAuthorityName { get; set; }

    public bool FintaxJurIsActive { get; set; }

    public virtual ICollection<FinComplianceRule> FinComplianceRules { get; set; } = new List<FinComplianceRule>();

    public virtual ICollection<FinTaxReturnPeriod> FinTaxReturnPeriods { get; set; } = new List<FinTaxReturnPeriod>();
}
