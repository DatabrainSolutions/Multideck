using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsIntegrationEvent
{
    public Guid WmseventId { get; set; }

    public Guid? WmseventFacilityId { get; set; }

    public Guid? WmseventOrgOfficeId { get; set; }

    public string WmseventEventTypeCode { get; set; } = null!;

    public string WmseventStatusCode { get; set; } = null!;

    public string? WmseventSourceSystemCode { get; set; }

    public string? WmseventSourceRecordTypeCode { get; set; }

    public Guid? WmseventSourceRecordId { get; set; }

    public string? WmseventTargetRecordTypeCode { get; set; }

    public Guid? WmseventTargetRecordId { get; set; }

    public Guid? WmseventJobId { get; set; }

    public Guid? WmseventEdimessageId { get; set; }

    public string WmseventPayloadJson { get; set; } = null!;

    public string? WmseventErrorText { get; set; }

    public DateTime WmseventCreatedAt { get; set; }

    public DateTime? WmseventProcessedAt { get; set; }

    public virtual EdiMessage? WmseventEdimessage { get; set; }

    public virtual WmsFacility? WmseventFacility { get; set; }

    public virtual JobHeader? WmseventJob { get; set; }

    public virtual CmpOffice? WmseventOrgOffice { get; set; }

    public virtual SysWmsintegrationEventStatus WmseventStatusCodeNavigation { get; set; } = null!;
}
