# @velobase/outreach

`createOutreach({ repository, isEnabled, recipient, deliver })` provides scene, template, scheduling and delivery rules. It depends on Zod and module metadata. Harness binds it to its existing database, recipient preferences, transport and Worker under `src/modules/outreach` and `/admin/touches/outreach`.

The recipient adapter enforces current account and notification preferences at scheduling and delivery. The delivery adapter makes one provider attempt and preserves uncertain-send outcomes. Disabling new outreach preserves history and already accepted work. Existing subscription reminder rules remain in the Harness binding.
