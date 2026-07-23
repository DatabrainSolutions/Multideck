using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsExceptionAction
{
    public Guid WmsexceptionActionId { get; set; }

    public Guid WmsexceptionActionExceptionId { get; set; }

    public string WmsexceptionActionActionTypeCode { get; set; } = null!;

    public string WmsexceptionActionActionText { get; set; } = null!;

    public string WmsexceptionActionActionStatusCode { get; set; } = null!;

    public Guid? WmsexceptionActionOwnerUserId { get; set; }

    public DateTime? WmsexceptionActionDueAt { get; set; }

    public DateTime? WmsexceptionActionCompletedAt { get; set; }

    public DateTime WmsexceptionActionCreatedAt { get; set; }

    public virtual WmsException WmsexceptionActionException { get; set; } = null!;

    public virtual CmpUser? WmsexceptionActionOwnerUser { get; set; }
}
