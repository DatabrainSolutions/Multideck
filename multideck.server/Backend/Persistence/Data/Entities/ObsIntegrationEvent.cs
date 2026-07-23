using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ObsIntegrationEvent
{
    public Guid ObseventId { get; set; }

    public string ObseventEventTypeCode { get; set; } = null!;

    public string? ObseventModuleCode { get; set; }

    public string? ObseventProviderCode { get; set; }

    public string? ObseventDirectionCode { get; set; }

    public string ObseventSeverityCode { get; set; } = null!;

    public string ObseventStatusCode { get; set; } = null!;

    public string? ObseventSourceTable { get; set; }

    public Guid? ObseventSourceId { get; set; }

    public string? ObseventCorrelationId { get; set; }

    public string? ObseventExternalReference { get; set; }

    public string? ObseventMessage { get; set; }

    public string ObseventRequestSummaryJson { get; set; } = null!;

    public string ObseventResponseSummaryJson { get; set; } = null!;

    public DateTime ObseventCreatedAt { get; set; }

    public Guid? ObseventCreatedBy { get; set; }

    public virtual CmpUser? ObseventCreatedByNavigation { get; set; }

    public virtual SysObseventType ObseventEventTypeCodeNavigation { get; set; } = null!;

    public virtual SysSubmoduleCode? ObseventModuleCodeNavigation { get; set; }

    public virtual SysObseventSeverity ObseventSeverityCodeNavigation { get; set; } = null!;

    public virtual SysObsrunStatus ObseventStatusCodeNavigation { get; set; } = null!;
}
