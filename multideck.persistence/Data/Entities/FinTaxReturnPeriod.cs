using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinTaxReturnPeriod
{
    public Guid FintaxPeriodId { get; set; }

    public Guid? FintaxPeriodLegalEntityId { get; set; }

    public Guid? FintaxPeriodJurisdictionId { get; set; }

    public string FintaxPeriodCode { get; set; } = null!;

    public DateOnly FintaxPeriodStartDate { get; set; }

    public DateOnly FintaxPeriodEndDate { get; set; }

    public string FintaxPeriodStatusCode { get; set; } = null!;

    public virtual ICollection<FinTaxReturn> FinTaxReturns { get; set; } = new List<FinTaxReturn>();

    public virtual FinTaxJurisdiction? FintaxPeriodJurisdiction { get; set; }

    public virtual CmpLegalEntity? FintaxPeriodLegalEntity { get; set; }
}
