using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmKpiresult
{
    public Guid ClmkpiId { get; set; }

    public string ClmkpiPeriodCode { get; set; } = null!;

    public Guid? ClmkpiOrgOfficeId { get; set; }

    public Guid? ClmkpiLegalEntityId { get; set; }

    public Guid? ClmkpiBrandId { get; set; }

    public string ClmkpiMetricCode { get; set; } = null!;

    public string ClmkpiMetricName { get; set; } = null!;

    public decimal? ClmkpiValueNumeric { get; set; }

    public string? ClmkpiValueCurrencyCode { get; set; }

    public string ClmkpiDimensionJson { get; set; } = null!;

    public string ClmkpiSourceJson { get; set; } = null!;

    public DateTime ClmkpiCreatedAt { get; set; }

    public Guid? ClmkpiCreatedBy { get; set; }

    public virtual CmpBrand? ClmkpiBrand { get; set; }

    public virtual CmpUser? ClmkpiCreatedByNavigation { get; set; }

    public virtual CmpLegalEntity? ClmkpiLegalEntity { get; set; }

    public virtual CmpOffice? ClmkpiOrgOffice { get; set; }
}
