using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommParticipantType
{
    public string CommParticipantTypeCode { get; set; } = null!;

    public string CommParticipantTypeName { get; set; } = null!;

    public string? CommParticipantTypeDescription { get; set; }

    public int CommParticipantTypeSortOrder { get; set; }

    public bool CommParticipantTypeIsActive { get; set; }

    public DateTime CommParticipantTypeCreatedAt { get; set; }

    public virtual ICollection<CommIdentity> CommIdentities { get; set; } = new List<CommIdentity>();

    public virtual ICollection<CommThreadParticipant> CommThreadParticipants { get; set; } = new List<CommThreadParticipant>();
}
