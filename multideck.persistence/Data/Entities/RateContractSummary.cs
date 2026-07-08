using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateContractSummary
{
    public Guid? RatecontractId { get; set; }

    public string? RatecontractCode { get; set; }

    public string? RatecontractName { get; set; }

    public string? RatecontractTypeCode { get; set; }

    public string? RatecontractStatusCode { get; set; }

    public Guid? RatecontractOrgOfficeId { get; set; }

    public string? RatecontractOfficeName { get; set; }

    public Guid? RatecontractCarrierOrgId { get; set; }

    public string? RatecontractCarrierName { get; set; }

    public Guid? RatecontractCustomerOrgId { get; set; }

    public string? RatecontractCustomerName { get; set; }

    public string? RatecontractCurrencyCodeSnapshot { get; set; }

    public DateOnly? RatecontractValidFrom { get; set; }

    public DateOnly? RatecontractValidTo { get; set; }

    public Guid? RatecontractCurrentVersionId { get; set; }

    public int? RatecontractCurrentVersionNo { get; set; }

    public long? RatecontractVersionCount { get; set; }

    public long? RatecontractSheetCount { get; set; }

    public long? RatecontractRateLineCount { get; set; }
}
