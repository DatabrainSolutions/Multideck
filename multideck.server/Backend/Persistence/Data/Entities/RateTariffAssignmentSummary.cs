using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateTariffAssignmentSummary
{
    public Guid? RatetariffAssignId { get; set; }

    public Guid? RatetariffAssignContractId { get; set; }

    public string? RatecontractCode { get; set; }

    public string? RatecontractName { get; set; }

    public string? RatecontractTypeCode { get; set; }

    public Guid? RatetariffAssignCustomerOrgId { get; set; }

    public string? CustomerName { get; set; }

    public Guid? RatetariffAssignCarrierOrgId { get; set; }

    public string? CarrierName { get; set; }

    public Guid? RatetariffAssignOrgOfficeId { get; set; }

    public string? OfficeName { get; set; }

    public string? RatetariffAssignModeCode { get; set; }

    public Guid? RatetariffAssignLaneId { get; set; }

    public string? RatelaneName { get; set; }

    public int? RatetariffAssignPriority { get; set; }

    public DateOnly? RatetariffAssignValidFrom { get; set; }

    public DateOnly? RatetariffAssignValidTo { get; set; }

    public bool? RatetariffAssignIsActive { get; set; }
}
