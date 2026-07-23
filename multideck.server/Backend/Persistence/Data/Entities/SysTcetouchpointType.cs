using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTcetouchpointType
{
    public string TcetouchpointTypeCode { get; set; } = null!;

    public string TcetouchpointTypeName { get; set; } = null!;

    public string? TcetouchpointTypeDescription { get; set; }

    public bool TcetouchpointTypeIsOperationalGate { get; set; }

    public bool TcetouchpointTypeIsActive { get; set; }

    public int TcetouchpointTypeSortOrder { get; set; }

    public virtual ICollection<TceComplianceChecklist> TceComplianceChecklists { get; set; } = new List<TceComplianceChecklist>();

    public virtual ICollection<TceIntegrationEvent> TceIntegrationEvents { get; set; } = new List<TceIntegrationEvent>();

    public virtual ICollection<TceScreeningTouchpointRule> TceScreeningTouchpointRules { get; set; } = new List<TceScreeningTouchpointRule>();
}
